import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

/** POST /api/tasks/:id/bids/:bidId/request-payment
 *  Bidder records on-chain proposal after creating it client-side.
 *  Body: { proposalIndex: number, txSignature: string }
 */
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

  const { proposalIndex, txSignature } = body
  if (proposalIndex === undefined || !txSignature) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: proposalIndex, txSignature' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: { winningBid: { include: { bidder: true } } },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (!task.winningBid || task.winningBid.id !== bidId) {
    return Response.json(
      { success: false, error: 'NOT_WINNING_BID', message: 'This is not the winning bid' },
      { status: 400 }
    )
  }

  // Only the winning bidder can request payment
  if (task.winningBid.bidderId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the winning bidder can request payment' },
      { status: 403 }
    )
  }

  if (task.winningBid.status !== 'FUNDED') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Bid is ${task.winningBid.status}, must be FUNDED to request payment` },
      { status: 400 }
    )
  }

  await prisma.bid.update({
    where: { id: bidId },
    data: {
      status: 'PAYMENT_REQUESTED',
      proposalIndex: Number(proposalIndex),
    },
  })

  return Response.json({
    success: true,
    message: 'Payment request recorded. Waiting for task creator approval.',
    proposalIndex,
    txSignature,
  })
}
