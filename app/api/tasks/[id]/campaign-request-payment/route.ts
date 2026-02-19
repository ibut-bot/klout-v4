import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'
import { formatTokenAmount, resolveTokenInfo, type PaymentTokenType } from '@/lib/token-utils'

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
  const pt = (task.paymentToken || 'SOL') as PaymentTokenType
  const tInfo = resolveTokenInfo(pt, task.customTokenMint, task.customTokenSymbol, task.customTokenDecimals)
  const sym = tInfo.symbol

  if (minPayout > BigInt(0) && totalPayout < minPayout) {
    return Response.json({
      success: false,
      error: 'BELOW_THRESHOLD',
      message: `Cumulative payout (${formatTokenAmount(totalPayout, tInfo)} ${sym}) is below the minimum payout threshold (${formatTokenAmount(minPayout, tInfo)} ${sym}). Keep submitting posts to accumulate more.`,
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

    // Determine per-user cap (if configured)
    let effectiveCeiling = budgetRemaining

    if (freshConfig.maxBudgetPerUserPercent != null) {
      const totalBudget = await tx.task.findUnique({ where: { id: taskId }, select: { budgetLamports: true } })
      const maxPerUser = totalBudget
        ? BigInt(Math.floor(Number(totalBudget.budgetLamports) * (freshConfig.maxBudgetPerUserPercent / 100)))
        : BigInt(0)

      if (maxPerUser > BigInt(0)) {
        const priorSubmissions = await tx.campaignSubmission.findMany({
          where: {
            taskId,
            submitterId: userId,
            status: { in: ['PAYMENT_REQUESTED', 'PAID'] },
          },
          select: { payoutLamports: true },
        })
        const priorPaid = priorSubmissions.reduce((sum, s) => sum + (s.payoutLamports || BigInt(0)), BigInt(0))
        const userBudgetLeft = maxPerUser - priorPaid

        if (userBudgetLeft <= BigInt(0)) {
          return { error: 'USER_CAP_REACHED' }
        }

        if (userBudgetLeft < effectiveCeiling) {
          effectiveCeiling = userBudgetLeft
        }
      }
    }

    let totalCapped = BigInt(0)
    const includedIds: string[] = []
    const cappedPayouts: { id: string; payout: bigint }[] = []

    for (const s of freshSubmissions) {
      const payout = s.payoutLamports || BigInt(0)
      if (payout <= BigInt(0)) continue

      const remaining = effectiveCeiling - totalCapped
      if (remaining <= BigInt(0)) break

      const capped = payout > remaining ? remaining : payout
      includedIds.push(s.id)
      cappedPayouts.push({ id: s.id, payout: capped })
      totalCapped += capped

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
    const messages: Record<string, string> = {
      BUDGET_EXHAUSTED: 'Campaign budget has been exhausted.',
      BELOW_THRESHOLD: 'Your cumulative payout is below the minimum payout threshold.',
      NO_APPROVED: 'No approved submissions found.',
      CONFIG_MISSING: 'Campaign configuration not found.',
      USER_CAP_REACHED: 'You have reached the maximum payout allowed per user for this campaign.',
    }
    return Response.json(
      { success: false, error: result.error, message: messages[result.error as string] || 'Payment request failed. Please try again.' },
      { status: 400 }
    )
  }

  // 6. Notify campaign creator
  await createNotification({
    userId: task.creatorId,
    type: 'CAMPAIGN_PAYMENT_REQUEST',
    title: 'Campaign payment requested',
    body: `A participant requested payment for ${result.submissionCount} post(s). Total: ${formatTokenAmount(result.totalPayoutLamports, tInfo)} ${sym}`,
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
