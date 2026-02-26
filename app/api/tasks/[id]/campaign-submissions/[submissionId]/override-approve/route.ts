import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'
import { formatTokenAmount, resolveTokenInfo, type PaymentTokenType } from '@/lib/token-utils'
import { getValidXToken, getPostMetrics } from '@/lib/x-api'
import { getKloutCpmMultiplier } from '@/lib/klout-cpm'
import { calculateFlatBonus } from '@/lib/klout-bonus'

interface RouteContext {
  params: Promise<{ id: string; submissionId: string }>
}

/**
 * POST /api/tasks/[id]/campaign-submissions/[submissionId]/override-approve
 *
 * Allows the campaign creator to override an auto-rejection and manually
 * approve a submission. Calculates payout from stored view count and CPM.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const { id: taskId, submissionId } = await context.params

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { campaignConfig: true },
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

  if (task.creatorId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the campaign creator can override rejections' },
      { status: 403 }
    )
  }

  const config = task.campaignConfig
  if (!config) {
    return Response.json(
      { success: false, error: 'CONFIG_MISSING', message: 'Campaign configuration not found' },
      { status: 500 }
    )
  }

  const submission = await prisma.campaignSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      taskId: true,
      submitterId: true,
      xPostId: true,
      status: true,
      viewCount: true,
      likeCount: true,
      retweetCount: true,
      commentCount: true,
      payoutLamports: true,
      rejectionReason: true,
    },
  })

  if (!submission || submission.taskId !== taskId) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Submission not found' }, { status: 404 })
  }

  if (submission.status !== 'REJECTED') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Submission status is ${submission.status}, can only override REJECTED submissions` },
      { status: 400 }
    )
  }

  if (config.budgetRemainingLamports <= BigInt(0)) {
    return Response.json(
      { success: false, error: 'BUDGET_EXHAUSTED', message: 'The campaign budget has been fully allocated' },
      { status: 400 }
    )
  }

  let viewCount = submission.viewCount ?? 0
  let likeCount = submission.likeCount ?? 0
  let retweetCount = submission.retweetCount ?? 0
  let commentCount = submission.commentCount ?? 0

  if (viewCount === 0) {
    const accessToken = await getValidXToken(submission.submitterId)
    if (!accessToken) {
      return Response.json(
        { success: false, error: 'X_TOKEN_EXPIRED', message: 'Submitter\'s X account token has expired. They need to re-link their X account before this override can proceed.' },
        { status: 400 }
      )
    }

    try {
      const postMetrics = await getPostMetrics(submission.xPostId!, accessToken)
      viewCount = postMetrics.viewCount
      likeCount = postMetrics.likeCount
      retweetCount = postMetrics.retweetCount
      commentCount = postMetrics.commentCount

      await prisma.campaignSubmission.update({
        where: { id: submissionId },
        data: {
          viewCount,
          likeCount,
          retweetCount,
          commentCount,
          viewsReadAt: new Date(),
        },
      })
    } catch (err: any) {
      return Response.json(
        { success: false, error: 'X_API_ERROR', message: `Failed to fetch post metrics: ${err.message}` },
        { status: 502 }
      )
    }
  }

  const submitter = await prisma.user.findUnique({
    where: { id: submission.submitterId },
    select: { xScores: { select: { totalScore: true }, orderBy: { createdAt: 'desc' as const }, take: 1 } },
  })
  const kloutScore = submitter?.xScores?.[0]?.totalScore ?? 0
  const cpmMultiplier = getKloutCpmMultiplier(kloutScore)
  const effectiveCpm = Number(config.cpmLamports) * cpmMultiplier
  let payoutLamports = BigInt(Math.floor((viewCount / 1000) * effectiveCpm))

  if (config.maxBudgetPerPostPercent != null) {
    const maxPerPost = BigInt(Math.floor(Number(task.budgetLamports) * (config.maxBudgetPerPostPercent / 100)))
    if (maxPerPost > BigInt(0) && payoutLamports > maxPerPost) {
      payoutLamports = maxPerPost
    }
  }

  let flatBonusLamports = BigInt(0)
  if (config.bonusMinKloutScore != null && config.bonusMaxLamports != null && config.bonusMaxLamports > BigInt(0)) {
    if (kloutScore >= config.bonusMinKloutScore) {
      const priorApproved = await prisma.campaignSubmission.count({
        where: {
          taskId,
          submitterId: submission.submitterId,
          status: { in: ['APPROVED', 'PAYMENT_REQUESTED', 'PAID'] },
          flatBonusLamports: { not: null, gt: BigInt(0) },
        },
      })
      if (priorApproved === 0) {
        flatBonusLamports = calculateFlatBonus(kloutScore, config.bonusMinKloutScore, config.bonusMaxLamports)
        payoutLamports += flatBonusLamports
      }
    }
  }

  if (payoutLamports <= BigInt(0)) {
    return Response.json(
      { success: false, error: 'ZERO_PAYOUT', message: 'Calculated payout is zero. Cannot approve a submission with no payout.' },
      { status: 400 }
    )
  }

  await prisma.campaignSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'APPROVED',
      payoutLamports,
      flatBonusLamports: flatBonusLamports > BigInt(0) ? flatBonusLamports : null,
      kloutScoreAtSubmission: kloutScore,
      cpmMultiplierApplied: cpmMultiplier,
      rejectionReason: null,
    },
  })

  const pt = (task.paymentToken || 'SOL') as PaymentTokenType
  const tInfo = resolveTokenInfo(pt, task.customTokenMint, task.customTokenSymbol, task.customTokenDecimals)
  const payoutDisplay = `${formatTokenAmount(payoutLamports, tInfo)} ${tInfo.symbol}`

  await createNotification({
    userId: submission.submitterId,
    type: 'CAMPAIGN_SUBMISSION_APPROVED',
    title: 'Submission approved by creator!',
    body: `The campaign creator manually approved your previously rejected submission. Payout: ${payoutDisplay}`,
    linkUrl: `/tasks/${taskId}`,
  })

  return Response.json({
    success: true,
    message: 'Submission override approved',
    submission: {
      id: submissionId,
      status: 'APPROVED',
      payoutLamports: payoutLamports.toString(),
    },
  })
}
