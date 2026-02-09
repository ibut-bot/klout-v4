import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getConnection } from '@/lib/solana/connection'
import { createNotification } from '@/lib/notifications'

/** POST /api/tasks/:id/bids/:bidId/approve-payment
 *  Task creator records that they approved + executed the on-chain vault tx.
 *  Body: { approveTxSignature: string, executeTxSignature: string }
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

  const { approveTxSignature, executeTxSignature, paymentTxSignature: singleTxSig } = body

  // For competition tasks, a single paymentTxSignature covers proposal+approve+execute.
  // For quote tasks, approveTxSignature and executeTxSignature are separate.
  const effectiveExecuteSig = singleTxSig || executeTxSignature
  if (!effectiveExecuteSig) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: paymentTxSignature (competition) or approveTxSignature + executeTxSignature (quote)' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: { winningBid: true },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  // Only the task creator can approve payment
  if (task.creatorId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the task creator can approve payment' },
      { status: 403 }
    )
  }

  if (!task.winningBid || task.winningBid.id !== bidId) {
    return Response.json(
      { success: false, error: 'NOT_WINNING_BID', message: 'This is not the winning bid' },
      { status: 400 }
    )
  }

  const isCompetition = task.taskType === 'COMPETITION'
  const allowedStatuses = isCompetition
    ? ['ACCEPTED']  // Competition: payment happens right after accepting (skips FUNDED/PAYMENT_REQUESTED)
    : ['PAYMENT_REQUESTED']
  if (!allowedStatuses.includes(task.winningBid.status)) {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Bid is ${task.winningBid.status}, must be ${allowedStatuses.join(' or ')}` },
      { status: 400 }
    )
  }

  // Verify the execute transaction exists and succeeded on-chain
  try {
    const connection = getConnection()
    const tx = await connection.getParsedTransaction(effectiveExecuteSig, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    })
    if (!tx) {
      return Response.json(
        { success: false, error: 'TX_NOT_FOUND', message: 'Payment transaction not found or not confirmed on-chain' },
        { status: 400 }
      )
    }
    if (tx.meta?.err) {
      return Response.json(
        { success: false, error: 'TX_FAILED', message: 'Payment transaction failed on-chain' },
        { status: 400 }
      )
    }
  } catch (e: any) {
    return Response.json(
      { success: false, error: 'TX_VERIFY_ERROR', message: e.message || 'Failed to verify transaction on-chain' },
      { status: 400 }
    )
  }

  await prisma.$transaction([
    prisma.bid.update({
      where: { id: bidId },
      data: { status: 'COMPLETED', paymentTxSig: effectiveExecuteSig },
    }),
    prisma.task.update({
      where: { id },
      data: { status: 'COMPLETED' },
    }),
  ])

  // Notify bidder that payment has been approved
  createNotification({
    userId: task.winningBid.bidderId,
    type: 'PAYMENT_APPROVED',
    title: 'Payment approved!',
    body: `Payment for "${task.title}" has been approved and executed`,
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    message: 'Payment approved and executed. Task completed!',
    paymentTxSignature: effectiveExecuteSig,
  })
}
