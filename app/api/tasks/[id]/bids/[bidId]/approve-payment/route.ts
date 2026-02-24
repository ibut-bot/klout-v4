import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getConnection } from '@/lib/solana/connection'
import { createNotification } from '@/lib/notifications'
import { getReferralInfoForUser, calculateReferralSplit, recordReferralEarning } from '@/lib/referral'

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

  const effectiveExecuteSig = singleTxSig || executeTxSignature
  if (!effectiveExecuteSig) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: paymentTxSignature (competition) or approveTxSignature + executeTxSignature (quote)' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.creatorId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the task creator can approve payment' },
      { status: 403 }
    )
  }

  const isCompetition = task.taskType === 'COMPETITION'
  const isMultiWinner = isCompetition && task.maxWinners > 1

  // Find the bid being paid
  const bid = await prisma.bid.findUnique({ where: { id: bidId } })
  if (!bid || bid.taskId !== id) {
    return Response.json(
      { success: false, error: 'BID_NOT_FOUND', message: 'Bid not found for this task' },
      { status: 404 }
    )
  }

  // For multi-winner competitions, any ACCEPTED bid with a winnerPlace can be paid
  // For single-winner, must be the winningBid
  if (isMultiWinner) {
    if (bid.status !== 'ACCEPTED' || !bid.winnerPlace) {
      return Response.json(
        { success: false, error: 'INVALID_BID', message: 'This bid has not been selected as a winner' },
        { status: 400 }
      )
    }
  } else {
    if (!task.winningBidId || task.winningBidId !== bidId) {
      return Response.json(
        { success: false, error: 'NOT_WINNING_BID', message: 'This is not the winning bid' },
        { status: 400 }
      )
    }
    const allowedStatuses = isCompetition ? ['ACCEPTED'] : ['PAYMENT_REQUESTED']
    if (!allowedStatuses.includes(bid.status)) {
      return Response.json(
        { success: false, error: 'INVALID_STATUS', message: `Bid is ${bid.status}, must be ${allowedStatuses.join(' or ')}` },
        { status: 400 }
      )
    }
  }

  // Verify the transaction on-chain
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

  // For multi-winner: check if this completes all winner payments
  let allWinnersPaid = false
  if (isMultiWinner) {
    const completedCount = await prisma.bid.count({
      where: { taskId: id, winnerPlace: { not: null }, status: 'COMPLETED' },
    })
    // +1 for this bid being marked COMPLETED now
    allWinnersPaid = completedCount + 1 >= task.maxWinners
  }

  const txOps: any[] = [
    prisma.bid.update({
      where: { id: bidId },
      data: { status: 'COMPLETED', paymentTxSig: effectiveExecuteSig },
    }),
  ]

  if (isMultiWinner) {
    if (allWinnersPaid) {
      txOps.push(prisma.task.update({ where: { id }, data: { status: 'COMPLETED' } }))
    }
  } else {
    txOps.push(prisma.task.update({ where: { id }, data: { status: 'COMPLETED' } }))
  }

  await prisma.$transaction(txOps)

  // Record referral earning
  try {
    const refInfo = await getReferralInfoForUser(bid.bidderId)
    if (refInfo) {
      const payoutAmount = Number(bid.amountLamports)
      const split = calculateReferralSplit(payoutAmount, refInfo.referrerFeePct)
      if (split.referrerAmount > 0) {
        await recordReferralEarning({
          referralId: refInfo.referralId,
          referrerId: refInfo.referrerId,
          referredUserId: bid.bidderId,
          taskId: id,
          bidId,
          tokenType: (task.paymentToken || 'SOL') as 'SOL' | 'USDC' | 'CUSTOM',
          tokenMint: task.customTokenMint || undefined,
          totalAmount: bid.amountLamports as unknown as bigint,
          referrerAmount: BigInt(split.referrerAmount),
          platformAmount: BigInt(split.platformAmount),
          txSignature: effectiveExecuteSig,
        })
      }
    }
  } catch {
    // Non-fatal
  }

  createNotification({
    userId: bid.bidderId,
    type: 'PAYMENT_APPROVED',
    title: 'Payment approved!',
    body: `Payment for "${task.title}" has been approved and executed`,
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    message: allWinnersPaid
      ? 'All winners paid. Task completed!'
      : 'Payment approved and executed.',
    paymentTxSignature: effectiveExecuteSig,
  })
}
