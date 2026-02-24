import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/tasks/[id]/finish
 *
 * Finish a campaign early and refund remaining budget to the creator.
 * The creator must first execute an on-chain refund transaction from the vault,
 * then submit the tx signature here to confirm.
 *
 * Body: { refundTxSig: string }
 *
 * This will:
 * - Set campaign status to COMPLETED
 * - Set budgetRemainingLamports to 0
 * - Auto-reject APPROVED submissions (budget was never deducted for those)
 * - Leave PAYMENT_REQUESTED submissions payable
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
      { success: false, error: 'FORBIDDEN', message: 'Only the campaign creator can finish a campaign' },
      { status: 403 }
    )
  }

  if (task.taskType !== 'CAMPAIGN') {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'Only campaigns can be finished' },
      { status: 400 }
    )
  }

  if (task.status !== 'OPEN' && task.status !== 'PAUSED') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: 'Only OPEN or PAUSED campaigns can be finished' },
      { status: 400 }
    )
  }

  const remainingBudget = task.campaignConfig?.budgetRemainingLamports ?? BigInt(0)

  // If there's remaining budget, require a refund transaction
  if (remainingBudget > BigInt(0)) {
    if (!refundTxSig) {
      return Response.json(
        { success: false, error: 'MISSING_TX', message: 'refundTxSig is required when there is remaining budget to refund' },
        { status: 400 }
      )
    }

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

  // Atomically: complete the campaign, zero out budget, reject unprocessed submissions
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

    // Auto-reject APPROVED submissions (budget never deducted for these)
    await tx.campaignSubmission.updateMany({
      where: {
        taskId,
        status: 'APPROVED',
      },
      data: {
        status: 'REJECTED',
        rejectionReason: 'Campaign was finished by the creator. Remaining budget has been refunded.',
      },
    })
  })

  return Response.json({
    success: true,
    message: 'Campaign finished successfully. Remaining budget has been refunded.',
    refundedLamports: remainingBudget.toString(),
  })
}
