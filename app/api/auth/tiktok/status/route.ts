import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      tiktokUserId: true,
      tiktokUsername: true,
      tiktokDisplayName: true,
      tiktokFollowerCount: true,
      tiktokVideoCount: true,
    },
  })

  return Response.json({
    success: true,
    linked: Boolean(user?.tiktokUserId),
    tiktokUserId: user?.tiktokUserId || null,
    tiktokUsername: user?.tiktokUsername || null,
    tiktokDisplayName: user?.tiktokDisplayName || null,
    tiktokFollowerCount: user?.tiktokFollowerCount ?? null,
    tiktokVideoCount: user?.tiktokVideoCount ?? null,
  })
}
