import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { extractPostId, getPostMetrics, getValidXToken } from '@/lib/x-api'
import { checkContentGuidelines } from '@/lib/content-check'
import { verifyPaymentTx } from '@/lib/solana/verify-tx'
import { createNotification } from '@/lib/notifications'

// Allow up to 60s for Solana + X API + Anthropic calls
export const maxDuration = 60

const SYSTEM_WALLET = process.env.SYSTEM_WALLET_ADDRESS || ''
const X_API_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_X_API_FEE_LAMPORTS || 500000) // ~10c SOL

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/tasks/[id]/campaign-submit
 *
 * Submit a post URL against a campaign task. Flow:
 * 1. Validate user has linked X account
 * 2. Validate task is CAMPAIGN and OPEN
 * 3. Extract post ID from URL
 * 4. Check budget remaining
 * 5. Verify API fee payment (10c SOL to system wallet)
 * 6. Call X API for views + text
 * 7. Verify post ownership
 * 8. Check minimum views
 * 9. AI content check
 * 10. Calculate payout and create submission
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

  const { postUrl, apiFeeTxSig } = body

  if (!postUrl || !apiFeeTxSig) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: postUrl, apiFeeTxSig' },
      { status: 400 }
    )
  }

  // 1. Check user has linked X account
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, xUserId: true, xUsername: true, walletAddress: true },
  })

  if (!user?.xUserId) {
    return Response.json(
      { success: false, error: 'X_NOT_LINKED', message: 'You must link your X account before submitting to campaigns' },
      { status: 400 }
    )
  }

  // 2. Validate task
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { campaignConfig: true, creator: { select: { id: true, walletAddress: true } } },
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

  if (task.status !== 'OPEN') {
    return Response.json(
      { success: false, error: 'TASK_CLOSED', message: 'This campaign is no longer accepting submissions' },
      { status: 400 }
    )
  }

  if (task.deadlineAt && new Date() > task.deadlineAt) {
    return Response.json(
      { success: false, error: 'DEADLINE_PASSED', message: 'The campaign deadline has passed' },
      { status: 400 }
    )
  }

  if (task.creatorId === userId) {
    return Response.json(
      { success: false, error: 'OWN_TASK', message: 'You cannot submit to your own campaign' },
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

  // 3. Extract post ID
  const xPostId = extractPostId(postUrl)
  if (!xPostId) {
    return Response.json(
      { success: false, error: 'INVALID_URL', message: 'Invalid X/Twitter post URL. Expected format: https://x.com/username/status/123456' },
      { status: 400 }
    )
  }

  // 4. Check for duplicate
  const existing = await prisma.campaignSubmission.findUnique({
    where: { taskId_xPostId: { taskId, xPostId } },
  })

  if (existing) {
    // If a previous attempt got stuck in a processing state (e.g. timeout),
    // delete it so the user can retry
    const processingStates = ['READING_VIEWS', 'CHECKING_CONTENT']
    if (processingStates.includes(existing.status)) {
      await prisma.campaignSubmission.delete({ where: { id: existing.id } })
    } else {
      return Response.json(
        { success: false, error: 'DUPLICATE', message: 'This post has already been submitted to this campaign' },
        { status: 409 }
      )
    }
  }

  // 5. Check budget remaining
  if (config.budgetRemainingLamports <= BigInt(0)) {
    return Response.json(
      { success: false, error: 'BUDGET_EXHAUSTED', message: 'The campaign budget has been fully allocated' },
      { status: 400 }
    )
  }

  // 6. Verify API fee payment
  if (!SYSTEM_WALLET) {
    return Response.json(
      { success: false, error: 'SERVER_CONFIG_ERROR', message: 'System wallet not configured' },
      { status: 503 }
    )
  }

  const feeVerification = await verifyPaymentTx(apiFeeTxSig, SYSTEM_WALLET, X_API_FEE_LAMPORTS)
  if (!feeVerification.valid) {
    return Response.json(
      { success: false, error: 'INVALID_PAYMENT', message: feeVerification.error || 'API fee payment verification failed' },
      { status: 400 }
    )
  }

  // Create the submission record early so we can update it through the process
  const submission = await prisma.campaignSubmission.create({
    data: {
      taskId,
      submitterId: userId,
      postUrl,
      xPostId,
      apiFeeTxSig,
      status: 'READING_VIEWS',
    },
  })

  // 7. Get valid X token and fetch post metrics
  const accessToken = await getValidXToken(userId)
  if (!accessToken) {
    await prisma.campaignSubmission.update({
      where: { id: submission.id },
      data: { status: 'REJECTED', rejectionReason: 'X account token expired. Please re-link your X account.' },
    })
    return Response.json(
      { success: false, error: 'X_TOKEN_EXPIRED', message: 'Your X account token has expired. Please re-link your X account.' },
      { status: 401 }
    )
  }

  let postMetrics: { viewCount: number; text: string; authorId: string; media: { type: 'photo' | 'video' | 'animated_gif'; url?: string; previewImageUrl?: string }[] }
  try {
    postMetrics = await getPostMetrics(xPostId, accessToken)
  } catch (err: any) {
    await prisma.campaignSubmission.update({
      where: { id: submission.id },
      data: { status: 'REJECTED', rejectionReason: `Failed to read post metrics: ${err.message}` },
    })
    return Response.json(
      { success: false, error: 'X_API_ERROR', message: `Failed to read post metrics: ${err.message}` },
      { status: 502 }
    )
  }

  const now = new Date()

  // 8. Verify post ownership
  if (postMetrics.authorId !== user.xUserId) {
    await prisma.campaignSubmission.update({
      where: { id: submission.id },
      data: {
        viewCount: postMetrics.viewCount,
        viewsReadAt: now,
        status: 'REJECTED',
        rejectionReason: 'The submitted post does not belong to your linked X account.',
      },
    })
    return Response.json(
      { success: false, error: 'NOT_POST_OWNER', message: 'The submitted post does not belong to your linked X account' },
      { status: 400 }
    )
  }

  // 9. Check minimum views
  if (postMetrics.viewCount < config.minViews) {
    await prisma.campaignSubmission.update({
      where: { id: submission.id },
      data: {
        viewCount: postMetrics.viewCount,
        viewsReadAt: now,
        status: 'REJECTED',
        rejectionReason: `Post has ${postMetrics.viewCount} views, minimum required is ${config.minViews}.`,
      },
    })
    return Response.json({
      success: false,
      error: 'INSUFFICIENT_VIEWS',
      message: `Post has ${postMetrics.viewCount} views, minimum required is ${config.minViews}`,
      viewCount: postMetrics.viewCount,
      minViews: config.minViews,
    }, { status: 400 })
  }

  // 10. AI content check
  await prisma.campaignSubmission.update({
    where: { id: submission.id },
    data: { status: 'CHECKING_CONTENT', viewCount: postMetrics.viewCount, viewsReadAt: now },
  })

  const guidelines = config.guidelines as { dos: string[]; donts: string[] }
  let contentCheck: { passed: boolean; explanation: string }
  try {
    contentCheck = await checkContentGuidelines(postMetrics.text, guidelines, postMetrics.media)
  } catch (err: any) {
    await prisma.campaignSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'REJECTED',
        rejectionReason: `Content check failed: ${err.message}`,
        contentCheckPassed: false,
        contentCheckExplanation: err.message,
      },
    })
    return Response.json(
      { success: false, error: 'CONTENT_CHECK_ERROR', message: `Content check service error: ${err.message}` },
      { status: 502 }
    )
  }

  if (!contentCheck.passed) {
    await prisma.campaignSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'REJECTED',
        rejectionReason: contentCheck.explanation,
        contentCheckPassed: false,
        contentCheckExplanation: contentCheck.explanation,
      },
    })

    // Notify submitter
    await createNotification({
      userId,
      type: 'CAMPAIGN_SUBMISSION_REJECTED',
      title: 'Campaign submission rejected',
      body: `Your post did not meet the campaign guidelines: ${contentCheck.explanation}`,
      linkUrl: `/tasks/${taskId}`,
    })

    return Response.json({
      success: false,
      error: 'CONTENT_REJECTED',
      message: 'Your post does not meet the campaign guidelines',
      explanation: contentCheck.explanation,
      viewCount: postMetrics.viewCount,
    }, { status: 400 })
  }

  // 11. Calculate payout
  const payoutLamports = BigInt(Math.floor((postMetrics.viewCount / 1000) * Number(config.cpmLamports)))
  // Cap payout at remaining budget
  const actualPayout = payoutLamports > config.budgetRemainingLamports
    ? config.budgetRemainingLamports
    : payoutLamports

  if (actualPayout <= BigInt(0)) {
    await prisma.campaignSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'REJECTED',
        rejectionReason: 'Campaign budget has been exhausted.',
        contentCheckPassed: true,
        contentCheckExplanation: contentCheck.explanation,
        viewCount: postMetrics.viewCount,
        viewsReadAt: now,
      },
    })
    return Response.json(
      { success: false, error: 'BUDGET_EXHAUSTED', message: 'Campaign budget has been exhausted' },
      { status: 400 }
    )
  }

  // 12. Update submission and reduce budget atomically
  const [updatedSubmission] = await prisma.$transaction([
    prisma.campaignSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'APPROVED',
        viewCount: postMetrics.viewCount,
        viewsReadAt: now,
        contentCheckPassed: true,
        contentCheckExplanation: contentCheck.explanation,
        payoutLamports: actualPayout,
      },
    }),
    prisma.campaignConfig.update({
      where: { taskId },
      data: {
        budgetRemainingLamports: { decrement: actualPayout },
      },
    }),
  ])

  // 13. Notify campaign creator
  await createNotification({
    userId: task.creatorId,
    type: 'CAMPAIGN_PAYMENT_REQUEST',
    title: 'New campaign payout request',
    body: `@${user.xUsername} submitted a post with ${postMetrics.viewCount} views. Payout: ${Number(actualPayout) / 1e9} SOL`,
    linkUrl: `/tasks/${taskId}`,
  })

  // Notify submitter
  await createNotification({
    userId,
    type: 'CAMPAIGN_SUBMISSION_APPROVED',
    title: 'Campaign submission approved!',
    body: `Your post was approved with ${postMetrics.viewCount} views. Pending payout: ${Number(actualPayout) / 1e9} SOL`,
    linkUrl: `/tasks/${taskId}`,
  })

  return Response.json({
    success: true,
    submission: {
      id: updatedSubmission.id,
      postUrl: updatedSubmission.postUrl,
      viewCount: updatedSubmission.viewCount,
      payoutLamports: updatedSubmission.payoutLamports?.toString(),
      status: updatedSubmission.status,
      contentCheckExplanation: updatedSubmission.contentCheckExplanation,
    },
  }, { status: 201 })
}
