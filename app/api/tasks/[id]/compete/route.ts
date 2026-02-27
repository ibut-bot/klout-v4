import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { createNotification } from '@/lib/notifications'
import { verifyPaymentTx } from '@/lib/solana/verify-tx'
import { extractPostId, getPostMetrics, getValidXToken } from '@/lib/x-api'
import { extractYouTubeVideoId, getYouTubeVideoMetrics } from '@/lib/youtube-api'
import { extractTikTokVideoId, getTikTokVideoMetrics, getValidTikTokToken } from '@/lib/tiktok-api'

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

  const descTrimmed = description.trim()
  const firstLine = descTrimmed.split('\n')[0].trim()

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

  const isYouTube = task.platform === 'YOUTUBE'
  const isTikTok = task.platform === 'TIKTOK'

  // Extract post/video ID based on platform
  let xPostId: string | null = null
  let youtubeVideoId: string | null = null
  let tiktokVideoId: string | null = null

  if (isTikTok) {
    tiktokVideoId = extractTikTokVideoId(firstLine)
    if (!tiktokVideoId) {
      return Response.json(
        { success: false, error: 'INVALID_POST_URL', message: 'Description must start with a valid TikTok video URL' },
        { status: 400 }
      )
    }
  } else if (isYouTube) {
    youtubeVideoId = extractYouTubeVideoId(firstLine)
    if (!youtubeVideoId) {
      return Response.json(
        { success: false, error: 'INVALID_POST_URL', message: 'Description must start with a valid YouTube video URL' },
        { status: 400 }
      )
    }
  } else {
    xPostId = extractPostId(firstLine)
    if (!xPostId) {
      return Response.json(
        { success: false, error: 'INVALID_POST_URL', message: 'Description must start with a valid X (Twitter) post URL' },
        { status: 400 }
      )
    }
  }

  // Prevent submitting the same post twice for this competition
  const duplicatePost = await prisma.submission.findFirst({
    where: isTikTok
      ? { tiktokVideoId, bid: { taskId: id } }
      : isYouTube
        ? { youtubeVideoId, bid: { taskId: id } }
        : { xPostId, bid: { taskId: id } },
  })
  if (duplicatePost) {
    return Response.json(
      { success: false, error: 'DUPLICATE_POST', message: `This ${isYouTube ? 'video' : 'post'} has already been submitted to this competition. Please submit a different ${isYouTube ? 'video' : 'post'}.` },
      { status: 409 }
    )
  }

  // Require linked account for ownership verification
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xUserId: true, xUsername: true, profilePicUrl: true, youtubeChannelId: true, tiktokUserId: true, tiktokUsername: true },
  })

  if (isTikTok) {
    if (!user?.tiktokUserId) {
      return Response.json(
        { success: false, error: 'TIKTOK_ACCOUNT_REQUIRED', message: 'You must link your TikTok account before submitting a competition entry. Go to your profile to connect it.' },
        { status: 400 }
      )
    }
  } else if (isYouTube) {
    if (!user?.youtubeChannelId) {
      return Response.json(
        { success: false, error: 'YOUTUBE_ACCOUNT_REQUIRED', message: 'You must link your YouTube channel before submitting a competition entry. Go to your profile to connect it.' },
        { status: 400 }
      )
    }
  } else {
    if (!user?.xUserId) {
      return Response.json(
        { success: false, error: 'X_ACCOUNT_REQUIRED', message: 'You must link your X (Twitter) account before submitting a competition entry. Go to your profile to connect it.' },
        { status: 400 }
      )
    }
  }

  // Fetch post/video metrics and verify ownership/date
  let viewCount = 0, likeCount = 0, retweetCount = 0, commentCount = 0
  let postText: string | undefined
  let postMedia: any[] = []

  if (isTikTok) {
    const tiktokToken = await getValidTikTokToken(userId)
    if (!tiktokToken) {
      return Response.json(
        { success: false, error: 'TIKTOK_TOKEN_EXPIRED', message: 'Your TikTok session has expired. Please re-link your TikTok account in your profile.' },
        { status: 400 }
      )
    }

    let ttMetrics: Awaited<ReturnType<typeof getTikTokVideoMetrics>>
    try {
      ttMetrics = await getTikTokVideoMetrics(tiktokVideoId!, tiktokToken)
    } catch (e: any) {
      return Response.json(
        { success: false, error: 'TIKTOK_API_ERROR', message: e.message || 'Failed to fetch video data from TikTok.' },
        { status: 400 }
      )
    }

    if (!task.allowPreLivePosts && new Date(ttMetrics.createTime * 1000) < task.createdAt) {
      return Response.json(
        { success: false, error: 'POST_TOO_OLD', message: 'This video was posted before the competition started. Please submit a video posted after the competition launch.' },
        { status: 400 }
      )
    }

    viewCount = ttMetrics.viewCount
    likeCount = ttMetrics.likeCount
    commentCount = ttMetrics.commentCount
    retweetCount = ttMetrics.shareCount
    postText = ttMetrics.title || ttMetrics.description
    if (ttMetrics.coverImageUrl) {
      postMedia = [{ type: 'photo', url: ttMetrics.coverImageUrl }]
    }
  } else if (isYouTube) {
    let ytMetrics: Awaited<ReturnType<typeof getYouTubeVideoMetrics>>
    try {
      ytMetrics = await getYouTubeVideoMetrics(youtubeVideoId!)
    } catch (e: any) {
      return Response.json(
        { success: false, error: 'YOUTUBE_API_ERROR', message: e.message || 'Failed to fetch video data from YouTube.' },
        { status: 400 }
      )
    }

    if (ytMetrics.channelId !== user.youtubeChannelId) {
      return Response.json(
        { success: false, error: 'POST_NOT_OWNED', message: 'This video does not belong to your linked YouTube channel.' },
        { status: 400 }
      )
    }

    if (!task.allowPreLivePosts && new Date(ytMetrics.publishedAt) < task.createdAt) {
      return Response.json(
        { success: false, error: 'POST_TOO_OLD', message: 'This video was published before the competition started. Please submit a video published after the competition launch.' },
        { status: 400 }
      )
    }

    viewCount = ytMetrics.viewCount
    likeCount = ytMetrics.likeCount
    commentCount = ytMetrics.commentCount
    postText = ytMetrics.title
    if (ytMetrics.thumbnailUrl) {
      postMedia = [{ type: 'photo', url: ytMetrics.thumbnailUrl }]
    }
  } else {
    let xMetrics: Awaited<ReturnType<typeof getPostMetrics>>
    try {
      const accessToken = await getValidXToken(userId)
      if (!accessToken) {
        return Response.json(
          { success: false, error: 'X_TOKEN_EXPIRED', message: 'Your X session has expired. Please re-link your X account in your profile.' },
          { status: 400 }
        )
      }
      xMetrics = await getPostMetrics(xPostId!, accessToken)
    } catch (e: any) {
      return Response.json(
        { success: false, error: 'X_API_ERROR', message: e.message || 'Failed to fetch post data from X. Please try again.' },
        { status: 400 }
      )
    }

    if (xMetrics.authorId !== user.xUserId) {
      return Response.json(
        { success: false, error: 'POST_NOT_OWNED', message: 'This post does not belong to your linked X account.' },
        { status: 400 }
      )
    }

    if (!task.allowPreLivePosts && new Date(xMetrics.createdAt) < task.createdAt) {
      return Response.json(
        { success: false, error: 'POST_TOO_OLD', message: 'This post was created before the competition started. Please submit a post created after the competition launch.' },
        { status: 400 }
      )
    }

    viewCount = xMetrics.viewCount
    likeCount = xMetrics.likeCount
    retweetCount = xMetrics.retweetCount
    commentCount = xMetrics.commentCount
    postText = xMetrics.text
    postMedia = xMetrics.media
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

    const authorName = isTikTok ? (user.tiktokUsername ? `@${user.tiktokUsername}` : undefined) : isYouTube ? undefined : (user.xUsername ? `@${user.xUsername}` : undefined)
    const authorUsername = isTikTok ? user.tiktokUsername : isYouTube ? undefined : user.xUsername

    const submission = await tx.submission.create({
      data: {
        bidId: bid.id,
        description: descTrimmed,
        postUrl,
        ...(xPostId ? { xPostId } : {}),
        ...(youtubeVideoId ? { youtubeVideoId } : {}),
        ...(tiktokVideoId ? { tiktokVideoId } : {}),
        postText,
        postMedia: postMedia.length > 0 ? (postMedia as any) : undefined,
        postAuthorName: authorName,
        postAuthorUsername: authorUsername,
        postAuthorProfilePic: user.profilePicUrl,
        viewCount,
        likeCount,
        retweetCount,
        commentCount,
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
