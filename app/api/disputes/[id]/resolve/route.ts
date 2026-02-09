import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getConnection } from '@/lib/solana/connection'
import { createNotification } from '@/lib/notifications'

const ARBITER_WALLET = process.env.ARBITER_WALLET_ADDRESS

/** POST /api/disputes/:id/resolve
 *  Resolve a dispute (arbiter only).
 *  Body for ACCEPT: { decision: 'ACCEPT', resolutionNotes?: string, approveTxSignature: string, executeTxSignature: string }
 *  Body for DENY: { decision: 'DENY', resolutionNotes?: string }
 *
 *  ACCEPT: Arbiter signed and executed the disputant's proposal on-chain.
 *  DENY: Arbiter rejected the dispute, no on-chain action needed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { wallet } = auth
  const { id } = await params

  // Only arbiter can resolve disputes
  if (wallet !== ARBITER_WALLET) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the platform arbiter can resolve disputes' },
      { status: 403 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { decision, resolutionNotes, approveTxSignature, executeTxSignature } = body
  if (!decision || !['ACCEPT', 'DENY'].includes(decision)) {
    return Response.json(
      { success: false, error: 'INVALID_DECISION', message: 'decision must be "ACCEPT" or "DENY"' },
      { status: 400 }
    )
  }

  if (decision === 'ACCEPT' && (!approveTxSignature || !executeTxSignature)) {
    return Response.json(
      { success: false, error: 'MISSING_TX_SIGNATURES', message: 'ACCEPT requires approveTxSignature and executeTxSignature' },
      { status: 400 }
    )
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      bid: {
        include: {
          task: true,
          disputes: true,
        },
      },
    },
  })

  if (!dispute) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Dispute not found' }, { status: 404 })
  }

  if (dispute.status !== 'PENDING') {
    return Response.json(
      { success: false, error: 'ALREADY_RESOLVED', message: 'This dispute has already been resolved' },
      { status: 400 }
    )
  }

  // If accepting, verify the execute transaction on-chain
  if (decision === 'ACCEPT') {
    try {
      const connection = getConnection()
      const tx = await connection.getParsedTransaction(executeTxSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      })
      if (!tx) {
        return Response.json(
          { success: false, error: 'TX_NOT_FOUND', message: 'Execute transaction not found or not confirmed on-chain' },
          { status: 400 }
        )
      }
      if (tx.meta?.err) {
        return Response.json(
          { success: false, error: 'TX_FAILED', message: 'Execute transaction failed on-chain' },
          { status: 400 }
        )
      }
    } catch (e: any) {
      return Response.json(
        { success: false, error: 'TX_VERIFY_ERROR', message: e.message || 'Failed to verify transaction on-chain' },
        { status: 400 }
      )
    }
  }

  // Update dispute and related records
  const result = await prisma.$transaction(async (tx) => {
    const updatedDispute = await tx.dispute.update({
      where: { id },
      data: {
        status: decision === 'ACCEPT' ? 'ACCEPTED' : 'DENIED',
        resolutionNotes: resolutionNotes || null,
        resolvedByWallet: wallet,
        resolveTxSig: approveTxSignature || null,
        executeTxSig: executeTxSignature || null,
        resolvedAt: new Date(),
      },
    })

    if (decision === 'ACCEPT') {
      // Mark the bid as completed (funds released to disputant)
      await tx.bid.update({
        where: { id: dispute.bidId },
        data: {
          status: 'COMPLETED',
          paymentTxSig: executeTxSignature,
        },
      })

      // Mark the task as completed
      await tx.task.update({
        where: { id: dispute.bid.taskId },
        data: { status: 'COMPLETED' },
      })

      // Deny any other pending disputes on this bid
      await tx.dispute.updateMany({
        where: {
          bidId: dispute.bidId,
          id: { not: id },
          status: 'PENDING',
        },
        data: {
          status: 'DENIED',
          resolutionNotes: 'Auto-denied: Another dispute was accepted',
          resolvedByWallet: wallet,
          resolvedAt: new Date(),
        },
      })
    } else {
      // If denied, check if there are other pending disputes
      const otherPending = await tx.dispute.count({
        where: {
          bidId: dispute.bidId,
          status: 'PENDING',
        },
      })

      // If no other pending disputes, revert to previous state
      if (otherPending === 0) {
        // Keep DISPUTED status for now - parties can raise new disputes or resolve normally
      }
    }

    return updatedDispute
  })

  // Notify both parties about the resolution
  const taskTitle = dispute.bid.task.title
  const taskId = dispute.bid.task.id
  const resolutionBody = decision === 'ACCEPT'
    ? `The dispute on "${taskTitle}" was accepted. Funds have been released.`
    : `The dispute on "${taskTitle}" was denied.`

  // Notify task creator
  createNotification({
    userId: dispute.bid.task.creatorId,
    type: 'DISPUTE_RESOLVED',
    title: 'Dispute resolved',
    body: resolutionBody,
    linkUrl: `/tasks/${taskId}`,
  })

  // Notify bidder
  createNotification({
    userId: dispute.bid.bidderId,
    type: 'DISPUTE_RESOLVED',
    title: 'Dispute resolved',
    body: resolutionBody,
    linkUrl: `/tasks/${taskId}`,
  })

  return Response.json({
    success: true,
    message: decision === 'ACCEPT'
      ? 'Dispute accepted. Funds have been released to the disputant.'
      : 'Dispute denied. No action taken.',
    dispute: {
      id: result.id,
      status: result.status,
      resolutionNotes: result.resolutionNotes,
      resolvedByWallet: result.resolvedByWallet,
      resolveTxSig: result.resolveTxSig,
      executeTxSig: result.executeTxSig,
      resolvedAt: result.resolvedAt?.toISOString(),
    },
  })
}
