import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/tasks/[id]/campaign-request-payment
 *
 * Called by a campaign participant to request payment for their approved posts.
 * Budget is only deducted at this point. All APPROVED submissions for the user
 * transition to PAYMENT_REQUESTED if the cumulative payout meets the threshold.
 *
 * Rules:
 * - Cumulative APPROVED payout must >= minPayoutLamports (or 0 means no minimum)
 * - Total requested amount cannot exceed budgetRemainingLamports
 * - Budget is atomically decremented
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const { id: taskId } = await context.params

  // 1. Validate task
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { campaignConfig: true, creator: { select: { id: true } } },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.taskType !== 'CAMPAIGN') {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'This endpoint is only for CAMPAIGN tasks' },
      { status: 400 }
    )
  }

  if (task.creatorId === userId) {
    return Response.json(
      { success: false, error: 'OWN_TASK', message: 'Campaign creator cannot request payment' },
      { status: 400 }
    )
  }

  const config = task.campaignConfig
  if (!config) {
    return Response.json(
      { success: false, error: 'CONFIG_MISSING', message: 'Campaign configuration not found' },
      { status: 500 }
    )
  }

  // 2. Get all APPROVED submissions for this user on this campaign
  const approvedSubmissions = await prisma.campaignSubmission.findMany({
    where: {
      taskId,
      submitterId: userId,
      status: 'APPROVED',
    },
  })

  if (approvedSubmissions.length === 0) {
    return Response.json(
      { success: false, error: 'NO_APPROVED', message: 'You have no approved submissions pending payment' },
      { status: 400 }
    )
  }

  // 3. Calculate cumulative payout
  const totalPayout = approvedSubmissions.reduce(
    (sum, s) => sum + (s.payoutLamports || BigInt(0)),
    BigInt(0)
  )

  // 4. Check minimum payout threshold
  const minPayout = config.minPayoutLamports
  if (minPayout > BigInt(0) && totalPayout < minPayout) {
    return Response.json({
      success: false,
      error: 'BELOW_THRESHOLD',
      message: `Cumulative payout (${Number(totalPayout) / 1e9} SOL) is below the minimum payout threshold (${Number(minPayout) / 1e9} SOL). Keep submitting posts to accumulate more.`,
      totalPayoutLamports: totalPayout.toString(),
      minPayoutLamports: minPayout.toString(),
    }, { status: 400 })
  }

  // 5. Atomically check budget, deduct, and mark submissions as PAYMENT_REQUESTED
  const result = await prisma.$transaction(async (tx) => {
    // Re-read config inside tx for consistency
    const freshConfig = await tx.campaignConfig.findUnique({ where: { taskId } })
    if (!freshConfig) return { error: 'CONFIG_MISSING' }

    // Re-read approved submissions inside tx (could have changed)
    const freshSubmissions = await tx.campaignSubmission.findMany({
      where: {
        taskId,
        submitterId: userId,
        status: 'APPROVED',
      },
    })

    if (freshSubmissions.length === 0) return { error: 'NO_APPROVED' }

    const freshTotal = freshSubmissions.reduce(
      (sum, s) => sum + (s.payoutLamports || BigInt(0)),
      BigInt(0)
    )

    // Re-check threshold inside tx
    if (freshConfig.minPayoutLamports > BigInt(0) && freshTotal < freshConfig.minPayoutLamports) {
      return { error: 'BELOW_THRESHOLD' }
    }

    const budgetRemaining = freshConfig.budgetRemainingLamports
    if (budgetRemaining <= BigInt(0)) {
      return { error: 'BUDGET_EXHAUSTED' }
    }

    // Cap payouts to fit within remaining budget
    // Walk through submissions, include full payouts until budget runs out, cap the last one
    let totalCapped = BigInt(0)
    const includedIds: string[] = []
    const cappedPayouts: { id: string; payout: bigint }[] = []

    for (const s of freshSubmissions) {
      const payout = s.payoutLamports || BigInt(0)
      if (payout <= BigInt(0)) continue

      const remaining = budgetRemaining - totalCapped
      if (remaining <= BigInt(0)) break

      const capped = payout > remaining ? remaining : payout
      includedIds.push(s.id)
      cappedPayouts.push({ id: s.id, payout: capped })
      totalCapped += capped

      // If we had to cap this one, update its payout amount
      if (capped < payout) {
        await tx.campaignSubmission.update({
          where: { id: s.id },
          data: { payoutLamports: capped },
        })
      }
    }

    if (includedIds.length === 0 || totalCapped <= BigInt(0)) {
      return { error: 'BUDGET_EXHAUSTED' }
    }

    // Deduct budget
    await tx.campaignConfig.update({
      where: { taskId },
      data: {
        budgetRemainingLamports: { decrement: totalCapped },
      },
    })

    // Mark included submissions as PAYMENT_REQUESTED
    await tx.campaignSubmission.updateMany({
      where: {
        id: { in: includedIds },
      },
      data: {
        status: 'PAYMENT_REQUESTED',
      },
    })

    return {
      success: true,
      submissionIds: includedIds,
      totalPayoutLamports: totalCapped.toString(),
      submissionCount: includedIds.length,
    }
  })

  if ('error' in result) {
    if (result.error === 'INSUFFICIENT_BUDGET') {
      return Response.json({
        success: false,
        error: 'INSUFFICIENT_BUDGET',
        message: `Insufficient campaign budget. Your total payout (${Number(BigInt(result.totalPayoutLamports!)) / 1e9} SOL) exceeds remaining budget (${Number(BigInt(result.budgetRemainingLamports!)) / 1e9} SOL).`,
        budgetRemainingLamports: result.budgetRemainingLamports,
        totalPayoutLamports: result.totalPayoutLamports,
      }, { status: 400 })
    }
    return Response.json(
      { success: false, error: result.error, message: 'Payment request failed. Please try again.' },
      { status: 400 }
    )
  }

  // 6. Notify campaign creator
  await createNotification({
    userId: task.creatorId,
    type: 'CAMPAIGN_PAYMENT_REQUEST',
    title: 'Campaign payment requested',
    body: `A participant requested payment for ${result.submissionCount} post(s). Total: ${Number(BigInt(result.totalPayoutLamports)) / 1e9} SOL`,
    linkUrl: `/tasks/${taskId}`,
  })

  return Response.json({
    success: true,
    message: `Payment requested for ${result.submissionCount} submission(s)`,
    submissionIds: result.submissionIds,
    totalPayoutLamports: result.totalPayoutLamports,
    submissionCount: result.submissionCount,
  })
}
