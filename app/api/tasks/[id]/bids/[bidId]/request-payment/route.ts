import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getConnection } from '@/lib/solana/connection'

/** POST /api/tasks/:id/bids/:bidId/request-payment
 *  Bidder records on-chain proposal after creating it client-side.
 *  Body: { proposalIndex: number, txSignature: string }
 *
 *  Server validates the on-chain proposal creation transaction exists and succeeded.
 *  The actual SOL transfers (90% bidder, 10% platform) are embedded in the vault
 *  transaction and execute when the creator approves.
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

  if (typeof proposalIndex !== 'number' || !Number.isInteger(proposalIndex) || proposalIndex < 0) {
    return Response.json(
      { success: false, error: 'INVALID_PROPOSAL_INDEX', message: 'proposalIndex must be a non-negative integer' },
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

  // Verify the transaction signature exists on-chain
  // Note: We only verify the proposal creation tx exists and succeeded.
  // The actual SOL transfers (90% bidder, 10% platform) are embedded in the vault transaction
  // and will only execute when the proposal is approved and executed by the creator.
  // We cannot validate the embedded transfer instructions from the creation tx alone.
  try {
    const connection = getConnection()
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    })
    if (!tx) {
      return Response.json(
        { success: false, error: 'TX_NOT_FOUND', message: 'Transaction not found or not confirmed on-chain' },
        { status: 400 }
      )
    }
    if (tx.meta?.err) {
      return Response.json(
        { success: false, error: 'TX_FAILED', message: 'Transaction failed on-chain' },
        { status: 400 }
      )
    }
  } catch (e: any) {
    if (e?.status) throw e // re-throw Response-like errors
    return Response.json(
      { success: false, error: 'TX_VERIFY_ERROR', message: e.message || 'Failed to verify transaction on-chain' },
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
