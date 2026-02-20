import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'
import { formatTokenAmount, resolveTokenInfo, type PaymentTokenType } from '@/lib/token-utils'

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
      status: true,
      viewCount: true,
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

  const viewCount = submission.viewCount ?? 0
  let payoutLamports = submission.payoutLamports
    ? BigInt(submission.payoutLamports)
    : BigInt(Math.floor((viewCount / 1000) * Number(config.cpmLamports)))

  if (config.maxBudgetPerPostPercent != null) {
    const maxPerPost = BigInt(Math.floor(Number(task.budgetLamports) * (config.maxBudgetPerPostPercent / 100)))
    if (maxPerPost > BigInt(0) && payoutLamports > maxPerPost) {
      payoutLamports = maxPerPost
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
