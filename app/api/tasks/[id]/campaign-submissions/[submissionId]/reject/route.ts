import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'

const VALID_REASONS = ['Botting', 'Quality', 'Relevancy', 'Other'] as const

interface RouteContext {
  params: Promise<{ id: string; submissionId: string }>
}

/**
 * POST /api/tasks/[id]/campaign-submissions/[submissionId]/reject
 *
 * Allows the campaign creator to manually reject an approved submission.
 * Restores the payout amount back to the campaign's remaining budget.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const { id: taskId, submissionId } = await context.params

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { reason, customReason } = body

  if (!reason || !VALID_REASONS.includes(reason)) {
    return Response.json(
      { success: false, error: 'INVALID_REASON', message: `reason must be one of: ${VALID_REASONS.join(', ')}` },
      { status: 400 }
    )
  }

  if (reason === 'Other' && (!customReason || typeof customReason !== 'string' || !customReason.trim())) {
    return Response.json(
      { success: false, error: 'MISSING_CUSTOM_REASON', message: 'customReason is required when reason is "Other"' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, creatorId: true, taskType: true },
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
      { success: false, error: 'FORBIDDEN', message: 'Only the campaign creator can reject submissions' },
      { status: 403 }
    )
  }

  const submission = await prisma.campaignSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, taskId: true, submitterId: true, status: true, payoutLamports: true },
  })

  if (!submission || submission.taskId !== taskId) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Submission not found' }, { status: 404 })
  }

  if (submission.status !== 'APPROVED' && submission.status !== 'PAYMENT_REQUESTED') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Submission status is ${submission.status}, can only reject APPROVED or PAYMENT_REQUESTED submissions` },
      { status: 400 }
    )
  }

  const rejectionText = reason === 'Other' ? customReason.trim() : reason
  const payoutToRestore = submission.payoutLamports || BigInt(0)

  // Reject the submission and restore budget atomically
  await prisma.$transaction([
    prisma.campaignSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'CREATOR_REJECTED',
        rejectionReason: rejectionText,
      },
    }),
    prisma.campaignConfig.update({
      where: { taskId },
      data: {
        budgetRemainingLamports: { increment: payoutToRestore },
      },
    }),
  ])

  await createNotification({
    userId: submission.submitterId,
    type: 'CAMPAIGN_CREATOR_REJECTED',
    title: 'Campaign submission rejected',
    body: `Your submission was rejected by the campaign creator. Reason: ${rejectionText}`,
    linkUrl: `/tasks/${taskId}`,
  })

  return Response.json({
    success: true,
    message: 'Submission rejected',
    submission: { id: submissionId, status: 'CREATOR_REJECTED', rejectionReason: rejectionText },
  })
}
