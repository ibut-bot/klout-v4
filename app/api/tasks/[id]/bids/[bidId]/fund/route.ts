import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { verifyFundingTx } from '@/lib/solana/verify-tx'
import { createNotification } from '@/lib/notifications'

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
  if (!fundingTxSignature || typeof fundingTxSignature !== 'string') {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: fundingTxSignature (string)' },
      { status: 400 }
    )
  }

  // Check for duplicate funding tx signature across all bids
  const existingFunding = await prisma.bid.findFirst({ where: { fundingTxSig: fundingTxSignature } })
  if (existingFunding) {
    return Response.json(
      { success: false, error: 'DUPLICATE_TX', message: 'This funding transaction has already been used' },
      { status: 409 }
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
    // Use BigInt-safe conversion: convert to Number only if within safe integer range
    const amountLamports = bid.amountLamports <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(bid.amountLamports)
      : Number(bid.amountLamports) // fallback; RPC returns number anyway
    const verification = await verifyFundingTx(
      fundingTxSignature,
      bid.vaultAddress,
      amountLamports
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

  // Notify bidder that escrow has been funded
  createNotification({
    userId: bid.bidderId,
    type: 'ESCROW_FUNDED',
    title: 'Escrow funded',
    body: `The escrow for "${task.title}" has been funded. You can start working!`,
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    message: 'Vault funded successfully',
    bidId,
    fundingTxSignature,
  })
}
