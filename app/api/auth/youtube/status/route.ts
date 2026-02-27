import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'

/**
 * GET /api/auth/youtube/status
 * Returns the YouTube channel link status for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      youtubeChannelId: true,
      youtubeChannelTitle: true,
      youtubeSubscriberCount: true,
      youtubeVideoCount: true,
      youtubeViewCount: true,
    },
  })

  return Response.json({
    success: true,
    linked: Boolean(user?.youtubeChannelId),
    youtubeChannelId: user?.youtubeChannelId || null,
    youtubeChannelTitle: user?.youtubeChannelTitle || null,
    youtubeSubscriberCount: user?.youtubeSubscriberCount ?? null,
    youtubeVideoCount: user?.youtubeVideoCount ?? null,
    youtubeViewCount: user?.youtubeViewCount?.toString() ?? null,
  })
}
