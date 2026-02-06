import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { verifyFundingTx } from '@/lib/solana/verify-tx'

/** POST /api/tasks/:id/bids/:bidId/fund -- record vault funding */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id, bidId } = await params

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { fundingTxSignature } = body
  if (!fundingTxSignature) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: fundingTxSignature' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.creatorId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only task creator can fund the vault' },
      { status: 403 }
    )
  }

  const bid = await prisma.bid.findUnique({ where: { id: bidId } })
  if (!bid || bid.taskId !== id) {
    return Response.json({ success: false, error: 'BID_NOT_FOUND', message: 'Bid not found' }, { status: 404 })
  }

  if (bid.status !== 'ACCEPTED') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Bid is ${bid.status}, must be ACCEPTED to fund` },
      { status: 400 }
    )
  }

  // Verify funding tx if vault address is known
  if (bid.vaultAddress) {
    const verification = await verifyFundingTx(
      fundingTxSignature,
      bid.vaultAddress,
      Number(bid.amountLamports)
    )
    if (!verification.valid) {
      return Response.json(
        { success: false, error: 'INVALID_FUNDING_TX', message: verification.error || 'Funding verification failed' },
        { status: 400 }
      )
    }
  }

  await prisma.bid.update({
    where: { id: bidId },
    data: { status: 'FUNDED', fundingTxSig: fundingTxSignature },
  })

  return Response.json({
    success: true,
    message: 'Vault funded successfully',
    bidId,
    fundingTxSignature,
  })
}
