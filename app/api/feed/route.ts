import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const cursor = searchParams.get('cursor')
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))

  const where: any = {
    NOT: { postMedia: { equals: null } },
    creatorRejected: false,
    bid: {
      task: {
        isPublicFeed: true,
        taskType: 'COMPETITION',
        status: { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'PAUSED'] },
      },
    },
  }

  if (cursor) {
    where.createdAt = { lt: new Date(cursor) }
  }

  const submissions = await prisma.submission.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      postUrl: true,
      xPostId: true,
      postText: true,
      postMedia: true,
      postAuthorName: true,
      postAuthorUsername: true,
      postAuthorProfilePic: true,
      viewCount: true,
      likeCount: true,
      retweetCount: true,
      commentCount: true,
      createdAt: true,
      _count: { select: { tips: true } },
      tips: {
        select: { amountLamports: true },
      },
      bid: {
        select: {
          winnerPlace: true,
          bidderId: true,
          bidder: {
            select: {
              walletAddress: true,
              username: true,
              profilePicUrl: true,
            },
          },
          task: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
            },
          },
        },
      },
    },
  })

  const hasMore = submissions.length > limit
  const items = submissions.slice(0, limit)
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null

  // Filter to only items that actually have media with urls
  const feed = items
    .filter(s => {
      const media = s.postMedia as any[]
      return Array.isArray(media) && media.length > 0 && media.some((m: any) => m.url || m.videoUrl || m.previewImageUrl)
    })
    .map(s => ({
      id: s.id,
      postUrl: s.postUrl,
      xPostId: s.xPostId,
      postText: s.postText,
      postMedia: s.postMedia,
      authorName: s.postAuthorName || s.bid.bidder.username,
      authorUsername: s.postAuthorUsername || s.bid.bidder.username,
      authorProfilePic: s.postAuthorProfilePic || s.bid.bidder.profilePicUrl,
      viewCount: s.viewCount ?? 0,
      likeCount: s.likeCount ?? 0,
      retweetCount: s.retweetCount ?? 0,
      commentCount: s.commentCount ?? 0,
      createdAt: s.createdAt.toISOString(),
      winnerPlace: s.bid.winnerPlace,
      recipientWallet: s.bid.bidder.walletAddress,
      tipCount: s._count.tips,
      tipTotalLamports: s.tips.reduce((sum, t) => sum + Number(t.amountLamports), 0).toString(),
      competition: {
        id: s.bid.task.id,
        title: s.bid.task.title,
        imageUrl: s.bid.task.imageUrl,
      },
    }))

  return Response.json({
    success: true,
    feed,
    nextCursor,
    hasMore,
  })
}
