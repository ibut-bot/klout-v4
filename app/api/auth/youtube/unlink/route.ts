import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'

/**
 * POST /api/auth/youtube/unlink
 * Unlink the YouTube channel from the authenticated user.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  await prisma.user.update({
    where: { id: auth.userId },
    data: { youtubeChannelId: null },
  })

  return Response.json({ success: true })
}
