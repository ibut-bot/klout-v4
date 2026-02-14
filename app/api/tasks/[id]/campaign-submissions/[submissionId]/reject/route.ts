import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string; submissionId: string }>
}

/**
 * POST /api/tasks/[id]/campaign-submissions/[submissionId]/reject
 *
 * Allows the campaign creator to reject an APPROVED or PAYMENT_REQUESTED submission.
 * - If APPROVED: no budget refund needed (budget not yet deducted).
 * - If PAYMENT_REQUESTED: budget is refunded back to the campaign.
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

  const { reason, banSubmitter } = body

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return Response.json(
      { success: false, error: 'MISSING_REASON', message: 'A rejection reason is required' },
      { status: 400 }
    )
  }

  if (reason.trim().length > 500) {
    return Response.json(
      { success: false, error: 'REASON_TOO_LONG', message: 'Rejection reason must be 500 characters or less' },
      { status: 400 }
    )
  }

  // Verify task exists and caller is creator
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

  // Verify submission
  const submission = await prisma.campaignSubmission.findUnique({
    where: { id: submissionId },
    include: { submitter: { select: { id: true, xUsername: true, walletAddress: true } } },
  })

  if (!submission || submission.taskId !== taskId) {
    return Response.json(
      { success: false, error: 'NOT_FOUND', message: 'Submission not found' },
      { status: 404 }
    )
  }

  const rejectableStatuses = ['APPROVED', 'PAYMENT_REQUESTED']
  if (!rejectableStatuses.includes(submission.status)) {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Submission status is ${submission.status}, expected APPROVED or PAYMENT_REQUESTED` },
      { status: 400 }
    )
  }

  const needsBudgetRefund = submission.status === 'PAYMENT_REQUESTED'
  const payoutToRefund = needsBudgetRefund ? (submission.payoutLamports || BigInt(0)) : BigInt(0)

  // Reject submission and refund budget atomically (only if PAYMENT_REQUESTED)
  await prisma.$transaction([
    prisma.campaignSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'CREATOR_REJECTED',
        rejectionReason: reason.trim(),
      },
    }),
    // Refund the allocated budget back to the campaign (only for PAYMENT_REQUESTED)
    ...(payoutToRefund > BigInt(0)
      ? [
          prisma.campaignConfig.update({
            where: { taskId },
            data: {
              budgetRemainingLamports: { increment: payoutToRefund },
            },
          }),
        ]
      : []),
  ])

  // Optionally ban the submitter from all future campaigns by this creator
  let banned = false
  if (banSubmitter) {
    try {
      await prisma.campaignBan.upsert({
        where: {
          creatorId_bannedUserId: {
            creatorId: userId,
            bannedUserId: submission.submitterId,
          },
        },
        update: {},
        create: {
          creatorId: userId,
          bannedUserId: submission.submitterId,
          reason: reason.trim(),
        },
      })
      banned = true

      // Notify the banned user
      await createNotification({
        userId: submission.submitterId,
        type: 'CAMPAIGN_BANNED',
        title: 'You have been banned from a creator\'s campaigns',
        body: `A campaign creator has banned you from submitting to their future campaigns. Reason: ${reason.trim()}`,
        linkUrl: `/tasks/${taskId}`,
      })
    } catch (e) {
      console.error('Failed to create campaign ban:', e)
    }
  }

  // Notify the submitter about the rejection
  await createNotification({
    userId: submission.submitterId,
    type: 'CAMPAIGN_CREATOR_REJECTED',
    title: 'Campaign submission rejected by creator',
    body: `The campaign creator rejected your submission. Reason: ${reason.trim()}`,
    linkUrl: `/tasks/${taskId}`,
  })

  return Response.json({
    success: true,
    message: banned ? 'Submission rejected and submitter banned' : 'Submission rejected',
    banned,
    submission: {
      id: submission.id,
      status: 'CREATOR_REJECTED',
      rejectionReason: reason.trim(),
    },
  })
}
