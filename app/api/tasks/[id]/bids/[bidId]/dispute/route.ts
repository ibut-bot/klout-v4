import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getConnection } from '@/lib/solana/connection'
import { createNotification } from '@/lib/notifications'

const PLATFORM_WALLET = process.env.ARBITER_WALLET_ADDRESS

/** POST /api/tasks/:id/bids/:bidId/dispute
 *  Raise a dispute on a funded task.
 *  Body: { proposalIndex: number, txSignature: string, reason: string, evidenceUrls?: string[] }
 *
 *  Either the task creator or the winning bidder can raise a dispute.
 *  The disputant must first create an on-chain proposal to release funds to themselves,
 *  then record it here with their reason and evidence.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId, wallet } = auth
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

  const { proposalIndex, txSignature, reason, evidenceUrls } = body
  if (proposalIndex === undefined || !txSignature || !reason) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: proposalIndex, txSignature, reason' },
      { status: 400 }
    )
  }

  if (typeof proposalIndex !== 'number' || !Number.isInteger(proposalIndex) || proposalIndex < 0) {
    return Response.json(
      { success: false, error: 'INVALID_PROPOSAL_INDEX', message: 'proposalIndex must be a non-negative integer' },
      { status: 400 }
    )
  }

  if (typeof reason !== 'string' || reason.length < 10 || reason.length > 5000) {
    return Response.json(
      { success: false, error: 'INVALID_REASON', message: 'reason must be between 10 and 5000 characters' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      creator: true,
      winningBid: { include: { bidder: true, disputes: true } },
    },
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

  // Determine who is raising the dispute
  const isCreator = task.creatorId === userId
  const isBidder = task.winningBid.bidderId === userId

  if (!isCreator && !isBidder) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the task creator or winning bidder can raise a dispute' },
      { status: 403 }
    )
  }

  // Must be in FUNDED or PAYMENT_REQUESTED status to dispute
  if (!['FUNDED', 'PAYMENT_REQUESTED'].includes(task.winningBid.status)) {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Bid status is ${task.winningBid.status}. Can only dispute FUNDED or PAYMENT_REQUESTED bids.` },
      { status: 400 }
    )
  }

  // Check if there's already a pending dispute from the same party
  const existingDispute = task.winningBid.disputes.find(
    (d) => d.status === 'PENDING' && d.raisedBy === (isCreator ? 'CREATOR' : 'BIDDER')
  )
  if (existingDispute) {
    return Response.json(
      { success: false, error: 'DUPLICATE_DISPUTE', message: 'You already have a pending dispute on this task' },
      { status: 400 }
    )
  }

  // Verify the transaction exists on-chain
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
    return Response.json(
      { success: false, error: 'TX_VERIFY_ERROR', message: e.message || 'Failed to verify transaction on-chain' },
      { status: 400 }
    )
  }

  // Create the dispute
  const dispute = await prisma.$transaction(async (tx) => {
    const newDispute = await tx.dispute.create({
      data: {
        bidId,
        raisedBy: isCreator ? 'CREATOR' : 'BIDDER',
        raisedByWallet: wallet,
        proposalIndex: Number(proposalIndex),
        proposalTxSig: txSignature,
        reason,
        evidenceUrls: evidenceUrls || [],
      },
    })

    // Update bid and task status to DISPUTED
    await tx.bid.update({
      where: { id: bidId },
      data: { status: 'DISPUTED' },
    })
    await tx.task.update({
      where: { id },
      data: { status: 'DISPUTED' },
    })

    return newDispute
  })

  // Notify the other party about the dispute
  const otherPartyId = isCreator ? task.winningBid!.bidderId : task.creatorId
  createNotification({
    userId: otherPartyId,
    type: 'DISPUTE_RAISED',
    title: 'Dispute raised',
    body: `A dispute has been raised on "${task.title}"`,
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    message: 'Dispute raised successfully. The platform arbiter will review your case.',
    dispute: {
      id: dispute.id,
      raisedBy: dispute.raisedBy,
      proposalIndex: dispute.proposalIndex,
      reason: dispute.reason,
      evidenceUrls: dispute.evidenceUrls,
      status: dispute.status,
      createdAt: dispute.createdAt.toISOString(),
    },
  })
}

/** GET /api/tasks/:id/bids/:bidId/dispute
 *  Get disputes for this bid (visible to creator, bidder, or arbiter)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId, wallet } = auth
  const { id, bidId } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      winningBid: { include: { bidder: true, disputes: true } },
    },
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

  // Only creator, bidder, or arbiter can view disputes
  const isCreator = task.creatorId === userId
  const isBidder = task.winningBid.bidderId === userId
  const isArbiter = wallet === PLATFORM_WALLET

  if (!isCreator && !isBidder && !isArbiter) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only task parties or the arbiter can view disputes' },
      { status: 403 }
    )
  }

  const disputes = task.winningBid.disputes.map((d) => ({
    id: d.id,
    raisedBy: d.raisedBy,
    raisedByWallet: d.raisedByWallet,
    proposalIndex: d.proposalIndex,
    reason: d.reason,
    evidenceUrls: d.evidenceUrls,
    status: d.status,
    responseReason: d.responseReason,
    responseEvidence: d.responseEvidence,
    resolutionNotes: d.resolutionNotes,
    resolvedByWallet: d.resolvedByWallet,
    createdAt: d.createdAt.toISOString(),
    resolvedAt: d.resolvedAt?.toISOString() || null,
  }))

  return Response.json({ success: true, disputes })
}
