import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'
import { formatTokenAmount, resolveTokenInfo, type PaymentTokenType } from '@/lib/token-utils'
import { getReferralInfoForUser, calculateReferralSplit, recordReferralEarning } from '@/lib/referral'

interface RouteContext {
  params: Promise<{ id: string; requestId: string }>
}

/**
 * POST /api/tasks/[id]/campaign-payment-requests/[requestId]/pay
 *
 * Called by the campaign creator after performing a single on-chain payment
 * for an entire payment request bundle. Marks all PAYMENT_REQUESTED submissions
 * in the bundle as PAID with the same tx signature.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const { id: taskId, requestId } = await context.params

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

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, creatorId: true, taskType: true, paymentToken: true, customTokenMint: true, customTokenSymbol: true, customTokenDecimals: true },
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

  const paymentRequest = await prisma.campaignPaymentRequest.findUnique({
    where: { id: requestId },
    include: {
      submissions: {
        where: { status: 'PAYMENT_REQUESTED' },
        include: { submitter: { select: { id: true, walletAddress: true, xUsername: true } } },
      },
      requester: { select: { id: true, walletAddress: true, xUsername: true } },
    },
  })

  if (!paymentRequest || paymentRequest.taskId !== taskId) {
    return Response.json(
      { success: false, error: 'NOT_FOUND', message: 'Payment request not found' },
      { status: 404 }
    )
  }

  if (paymentRequest.status !== 'PENDING') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Payment request status is ${paymentRequest.status}, expected PENDING` },
      { status: 400 }
    )
  }

  if (paymentRequest.submissions.length === 0) {
    return Response.json(
      { success: false, error: 'NO_SUBMISSIONS', message: 'No pending submissions in this payment request' },
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

  const submissionIds = paymentRequest.submissions.map(s => s.id)
  const proposalIndexBigInt = proposalIndex ? BigInt(proposalIndex) : null

  // Mark all submissions as PAID and update the payment request
  await prisma.$transaction([
    prisma.campaignSubmission.updateMany({
      where: { id: { in: submissionIds } },
      data: {
        status: 'PAID',
        paymentTxSig,
        paymentProposalIndex: proposalIndexBigInt,
      },
    }),
    prisma.campaignPaymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'PAID',
        paymentTxSig,
        paymentProposalIndex: proposalIndexBigInt,
      },
    }),
  ])

  // Record referral earnings for all submissions
  const totalPayout = paymentRequest.submissions.reduce(
    (sum, s) => sum + Number(s.payoutLamports || 0), 0
  )

  try {
    const refInfo = await getReferralInfoForUser(paymentRequest.requesterId)
    if (refInfo) {
      const split = calculateReferralSplit(totalPayout, refInfo.referrerFeePct)
      if (split.referrerAmount > 0) {
        await recordReferralEarning({
          referralId: refInfo.referralId,
          referrerId: refInfo.referrerId,
          referredUserId: paymentRequest.requesterId,
          taskId,
          submissionId: requestId,
          tokenType: (task.paymentToken || 'SOL') as 'SOL' | 'USDC' | 'CUSTOM',
          tokenMint: task.customTokenMint || undefined,
          totalAmount: BigInt(totalPayout),
          referrerAmount: BigInt(split.referrerAmount),
          platformAmount: BigInt(split.platformAmount),
          txSignature: paymentTxSig,
        })
      }
    }
  } catch {
    // Non-fatal
  }

  const pt = (task.paymentToken || 'SOL') as PaymentTokenType
  const tInfo = resolveTokenInfo(pt, task.customTokenMint, task.customTokenSymbol, task.customTokenDecimals)
  const payoutDisplay = `${formatTokenAmount(totalPayout, tInfo)} ${tInfo.symbol}`

  // Notify the requester
  await createNotification({
    userId: paymentRequest.requesterId,
    type: 'CAMPAIGN_PAYMENT_COMPLETED',
    title: 'Campaign payment received!',
    body: `You received ${payoutDisplay} for ${submissionIds.length} post(s).`,
    linkUrl: `/tasks/${taskId}`,
  })

  // Notify the creator (confirmation)
  const requesterName = paymentRequest.requester.xUsername
    ? `@${paymentRequest.requester.xUsername}`
    : paymentRequest.requester.walletAddress.slice(0, 8)

  await createNotification({
    userId,
    type: 'CAMPAIGN_PAYMENT_COMPLETED',
    title: 'Campaign payment sent',
    body: `Payment of ${payoutDisplay} sent to ${requesterName} for ${submissionIds.length} post(s).`,
    linkUrl: `/tasks/${taskId}`,
  })

  return Response.json({
    success: true,
    message: `Payment recorded for ${submissionIds.length} submission(s)`,
    paymentRequest: {
      id: requestId,
      status: 'PAID',
      paymentTxSig,
      submissionCount: submissionIds.length,
    },
  })
}
