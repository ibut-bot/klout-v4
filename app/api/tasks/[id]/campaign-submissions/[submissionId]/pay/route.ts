import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string; submissionId: string }>
}

/**
 * POST /api/tasks/[id]/campaign-submissions/[submissionId]/pay
 *
 * Called by the campaign creator after performing the on-chain payment.
 * The frontend calls createProposalApproveExecuteWA (without platform fee)
 * and then sends the tx signature here for verification.
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

  const { paymentTxSig, proposalIndex } = body

  if (!paymentTxSig) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: paymentTxSig' },
      { status: 400 }
    )
  }

  // Verify task exists and caller is creator
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, creatorId: true, taskType: true, multisigAddress: true },
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
      { success: false, error: 'FORBIDDEN', message: 'Only the campaign creator can approve payments' },
      { status: 403 }
    )
  }

  // Verify submission
  const submission = await prisma.campaignSubmission.findUnique({
    where: { id: submissionId },
    include: { submitter: { select: { id: true, walletAddress: true, xUsername: true } } },
  })

  if (!submission || submission.taskId !== taskId) {
    return Response.json(
      { success: false, error: 'NOT_FOUND', message: 'Submission not found' },
      { status: 404 }
    )
  }

  if (submission.status !== 'PAYMENT_REQUESTED') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Submission status is ${submission.status}, expected PAYMENT_REQUESTED` },
      { status: 400 }
    )
  }

  // Verify the payment transaction on-chain
  const { getConnection } = await import('@/lib/solana/connection')
  const connection = getConnection()

  try {
    const tx = await connection.getParsedTransaction(paymentTxSig, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    })

    if (!tx) {
      return Response.json(
        { success: false, error: 'TX_NOT_FOUND', message: 'Payment transaction not found or not confirmed' },
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
      { success: false, error: 'TX_VERIFY_ERROR', message: e.message || 'Failed to verify payment transaction' },
      { status: 400 }
    )
  }

  // Update submission to PAID
  await prisma.campaignSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'PAID',
      paymentTxSig,
      paymentProposalIndex: proposalIndex ? BigInt(proposalIndex) : null,
    },
  })

  // Notify the submitter
  await createNotification({
    userId: submission.submitterId,
    type: 'CAMPAIGN_PAYMENT_COMPLETED',
    title: 'Campaign payment received!',
    body: `You received ${Number(submission.payoutLamports || 0) / 1e9} SOL for your campaign post.`,
    linkUrl: `/tasks/${taskId}`,
  })

  // Notify the creator (confirmation)
  await createNotification({
    userId,
    type: 'CAMPAIGN_PAYMENT_COMPLETED',
    title: 'Campaign payment sent',
    body: `Payment of ${Number(submission.payoutLamports || 0) / 1e9} SOL sent to @${submission.submitter.xUsername || submission.submitter.walletAddress.slice(0, 8)}`,
    linkUrl: `/tasks/${taskId}`,
  })

  return Response.json({
    success: true,
    message: 'Payment recorded successfully',
    submission: {
      id: submission.id,
      status: 'PAID',
      paymentTxSig,
    },
  })
}
