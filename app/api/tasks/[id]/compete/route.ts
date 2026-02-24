import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { createNotification } from '@/lib/notifications'
import { verifyPaymentTx } from '@/lib/solana/verify-tx'
import { extractPostId, getPostMetrics, getValidXToken } from '@/lib/x-api'

const SYSTEM_WALLET = process.env.SYSTEM_WALLET_ADDRESS
const COMPETITION_ENTRY_FEE_LAMPORTS = Number(process.env.COMPETITION_ENTRY_FEE_LAMPORTS || 1000000)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { wallet, userId } = auth
  const { id } = await params

  const rl = rateLimitResponse(`bidCreate:${wallet}`, RATE_LIMITS.bidCreate)
  if (rl) return rl

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { description, attachments, entryFeeTxSignature } = body

  if (!description || !entryFeeTxSignature) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: description, entryFeeTxSignature' },
      { status: 400 }
    )
  }

  if (typeof description !== 'string' || description.trim().length === 0 || description.length > 10000) {
    return Response.json(
      { success: false, error: 'INVALID_DESCRIPTION', message: 'description must be a non-empty string of at most 10000 characters' },
      { status: 400 }
    )
  }

  // Extract X post URL from description (first line is always the URL)
  const descTrimmed = description.trim()
  const firstLine = descTrimmed.split('\n')[0].trim()
  const xPostId = extractPostId(firstLine)

  if (!xPostId) {
    return Response.json(
      { success: false, error: 'INVALID_POST_URL', message: 'Description must start with a valid X (Twitter) post URL' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }
  if (task.taskType !== 'COMPETITION') {
    return Response.json(
      { success: false, error: 'WRONG_TASK_TYPE', message: 'This endpoint is only for COMPETITION tasks.' },
      { status: 400 }
    )
  }
  if (task.status !== 'OPEN') {
    return Response.json(
      { success: false, error: 'TASK_NOT_OPEN', message: `Task is ${task.status}, not accepting entries` },
      { status: 400 }
    )
  }
  if (task.deadlineAt && new Date() > task.deadlineAt) {
    return Response.json(
      { success: false, error: 'COMPETITION_ENDED', message: 'This competition has ended. No more submissions are accepted.' },
      { status: 400 }
    )
  }
  if (task.creatorId === userId) {
    return Response.json(
      { success: false, error: 'SELF_BID', message: 'Cannot enter your own competition' },
      { status: 400 }
    )
  }

  const existingBid = await prisma.bid.findFirst({
    where: { taskId: id, bidderId: userId },
  })
  if (existingBid) {
    return Response.json(
      { success: false, error: 'DUPLICATE_ENTRY', message: 'You have already submitted an entry for this competition' },
      { status: 409 }
    )
  }

  // Require linked X account for ownership verification
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xUserId: true, xUsername: true, profilePicUrl: true },
  })
  if (!user?.xUserId) {
    return Response.json(
      { success: false, error: 'X_ACCOUNT_REQUIRED', message: 'You must link your X (Twitter) account before submitting a competition entry. Go to your profile to connect it.' },
      { status: 400 }
    )
  }

  // Fetch post metrics and verify ownership/date via X API
  let postMetrics: Awaited<ReturnType<typeof getPostMetrics>>
  try {
    const accessToken = await getValidXToken(userId)
    if (!accessToken) {
      return Response.json(
        { success: false, error: 'X_TOKEN_EXPIRED', message: 'Your X session has expired. Please re-link your X account in your profile.' },
        { status: 400 }
      )
    }
    postMetrics = await getPostMetrics(xPostId, accessToken)
  } catch (e: any) {
    return Response.json(
      { success: false, error: 'X_API_ERROR', message: e.message || 'Failed to fetch post data from X. Please try again.' },
      { status: 400 }
    )
  }

  // Ownership check
  if (postMetrics.authorId !== user.xUserId) {
    return Response.json(
      { success: false, error: 'POST_NOT_OWNED', message: 'This post does not belong to your linked X account.' },
      { status: 400 }
    )
  }

  // Date check: post must be created after competition was created
  if (new Date(postMetrics.createdAt) < task.createdAt) {
    return Response.json(
      { success: false, error: 'POST_TOO_OLD', message: 'This post was created before the competition started. Please submit a post created after the competition launch.' },
      { status: 400 }
    )
  }

  // Verify entry fee payment
  if (!SYSTEM_WALLET) {
    return Response.json(
      { success: false, error: 'SERVER_CONFIG_ERROR', message: 'System wallet is not configured' },
      { status: 503 }
    )
  }

  const feeVerification = await verifyPaymentTx(entryFeeTxSignature, SYSTEM_WALLET, COMPETITION_ENTRY_FEE_LAMPORTS)
  if (!feeVerification.valid) {
    return Response.json(
      { success: false, error: 'INVALID_ENTRY_FEE', message: feeVerification.error || 'Entry fee payment verification failed' },
      { status: 400 }
    )
  }

  let parsedAttachments = null
  if (attachments) {
    if (!Array.isArray(attachments)) {
      return Response.json(
        { success: false, error: 'INVALID_ATTACHMENTS', message: 'attachments must be an array' },
        { status: 400 }
      )
    }
    if (attachments.length > 20) {
      return Response.json(
        { success: false, error: 'TOO_MANY_ATTACHMENTS', message: 'Maximum 20 attachments' },
        { status: 400 }
      )
    }
    parsedAttachments = attachments
  }

  const postUrl = firstLine

  const [bid, submission] = await prisma.$transaction(async (tx) => {
    const bid = await tx.bid.create({
      data: {
        taskId: id,
        bidderId: userId,
        amountLamports: task.budgetLamports,
        description: descTrimmed,
      },
    })

    const submission = await tx.submission.create({
      data: {
        bidId: bid.id,
        description: descTrimmed,
        postUrl,
        xPostId,
        postText: postMetrics.text,
        postMedia: postMetrics.media.length > 0 ? postMetrics.media : undefined,
        postAuthorName: user.xUsername ? `@${user.xUsername}` : undefined,
        postAuthorUsername: user.xUsername,
        postAuthorProfilePic: user.profilePicUrl,
        viewCount: postMetrics.viewCount,
        likeCount: postMetrics.likeCount,
        retweetCount: postMetrics.retweetCount,
        commentCount: postMetrics.commentCount,
        metricsReadAt: new Date(),
        ...(parsedAttachments ? { attachments: parsedAttachments } : {}),
      },
    })

    return [bid, submission] as const
  })

  createNotification({
    userId: task.creatorId,
    type: 'SUBMISSION_RECEIVED',
    title: 'New competition entry',
    body: `@${user.xUsername || 'Someone'} submitted an entry for "${task.title}"`,
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    bid: {
      id: bid.id,
      taskId: bid.taskId,
      amountLamports: bid.amountLamports.toString(),
      description: bid.description,
      status: bid.status,
      createdAt: bid.createdAt.toISOString(),
    },
    submission: {
      id: submission.id,
      bidId: submission.bidId,
      description: submission.description,
      postUrl: submission.postUrl,
      xPostId: submission.xPostId,
      postText: submission.postText,
      postMedia: submission.postMedia,
      postAuthorName: submission.postAuthorName,
      postAuthorUsername: submission.postAuthorUsername,
      postAuthorProfilePic: submission.postAuthorProfilePic,
      viewCount: submission.viewCount,
      likeCount: submission.likeCount,
      retweetCount: submission.retweetCount,
      commentCount: submission.commentCount,
      attachments: submission.attachments,
      createdAt: submission.createdAt.toISOString(),
    },
    message: 'Competition entry submitted. Waiting for task creator to pick a winner.',
  }, { status: 201 })
}
