import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/tasks/[id]/finish
 *
 * Finish a campaign or competition early and refund remaining budget to the creator.
 * The creator must first execute an on-chain refund transaction from the vault,
 * then submit the tx signature here to confirm.
 *
 * Body: { refundTxSig: string }
 *
 * For CAMPAIGN:
 * - Set status to COMPLETED
 * - Set budgetRemainingLamports to 0
 * - Auto-reject APPROVED submissions
 * - Leave PAYMENT_REQUESTED submissions payable
 *
 * For COMPETITION:
 * - Set status to CANCELLED (or COMPLETED if all winners were already paid)
 * - Reject all PENDING bids
 * - Leave ACCEPTED/COMPLETED bids intact
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const { id: taskId } = await context.params

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { refundTxSig } = body

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      creatorId: true,
      taskType: true,
      status: true,
      budgetLamports: true,
      maxWinners: true,
      campaignConfig: { select: { id: true, budgetRemainingLamports: true } },
    },
  })

  if (!task) {
    return Response.json(
      { success: false, error: 'NOT_FOUND', message: 'Task not found' },
      { status: 404 }
    )
  }

  if (task.creatorId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the creator can finish this' },
      { status: 403 }
    )
  }

  const isCampaign = task.taskType === 'CAMPAIGN'
  const isCompetition = task.taskType === 'COMPETITION'

  if (!isCampaign && !isCompetition) {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'Only campaigns and competitions can be finished' },
      { status: 400 }
    )
  }

  const finishableStatuses = isCompetition
    ? ['OPEN', 'IN_PROGRESS', 'PAUSED']
    : ['OPEN', 'PAUSED']

  if (!finishableStatuses.includes(task.status)) {
    const typeLabel = isCompetition ? 'competition' : 'campaign'
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Only ${finishableStatuses.join(', ')} ${typeLabel}s can be finished` },
      { status: 400 }
    )
  }

  // Verify on-chain refund tx if provided
  if (refundTxSig) {
    const { getConnection } = await import('@/lib/solana/connection')
    const connection = getConnection()
    try {
      const tx = await connection.getParsedTransaction(refundTxSig, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      })
      if (!tx) {
        return Response.json(
          { success: false, error: 'TX_NOT_FOUND', message: 'Refund transaction not found or not confirmed on-chain' },
          { status: 400 }
        )
      }
      if (tx.meta?.err) {
        return Response.json(
          { success: false, error: 'TX_FAILED', message: 'Refund transaction failed on-chain' },
          { status: 400 }
        )
      }
    } catch (e: any) {
      return Response.json(
        { success: false, error: 'TX_VERIFY_ERROR', message: e.message || 'Failed to verify refund transaction' },
        { status: 400 }
      )
    }
  }

  if (isCampaign) {
    const remainingBudget = task.campaignConfig?.budgetRemainingLamports ?? BigInt(0)

    if (remainingBudget > BigInt(0) && !refundTxSig) {
      return Response.json(
        { success: false, error: 'MISSING_TX', message: 'refundTxSig is required when there is remaining budget to refund' },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { status: 'COMPLETED' },
      })

      if (task.campaignConfig) {
        await tx.campaignConfig.update({
          where: { id: task.campaignConfig.id },
          data: { budgetRemainingLamports: BigInt(0) },
        })
      }

      await tx.campaignSubmission.updateMany({
        where: { taskId, status: 'APPROVED' },
        data: { status: 'REJECTED', rejectionReason: 'Campaign finished.' },
      })
    })

    return Response.json({
      success: true,
      message: 'Campaign finished successfully. Remaining budget has been refunded.',
      refundedLamports: remainingBudget.toString(),
    })
  }

  // COMPETITION finish
  const completedBids = await prisma.bid.count({
    where: { taskId, status: 'COMPLETED', winnerPlace: { not: null } },
  })
  const acceptedBids = await prisma.bid.count({
    where: { taskId, status: 'ACCEPTED', winnerPlace: { not: null } },
  })

  // If all winners were paid, mark COMPLETED; otherwise CANCELLED
  const allWinnersPaid = completedBids >= (task.maxWinners || 1)
  const finalStatus = allWinnersPaid ? 'COMPLETED' : 'CANCELLED'

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: finalStatus },
    })

    // Reject all pending bids
    await tx.bid.updateMany({
      where: { taskId, status: 'PENDING' },
      data: { status: 'REJECTED' },
    })
  })

  return Response.json({
    success: true,
    message: finalStatus === 'COMPLETED'
      ? 'Competition completed. All winners were paid.'
      : `Competition stopped. ${completedBids + acceptedBids} winner(s) awarded. Remaining funds refunded.`,
    finalStatus,
    winnersPaid: completedBids,
    winnersAccepted: acceptedBids,
  })
}
