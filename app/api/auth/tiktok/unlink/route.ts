import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { tiktokAccessToken: true },
  })

  // Attempt to revoke the token (best-effort)
  if (user?.tiktokAccessToken) {
    try {
      await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_ID || '',
          client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
          token: user.tiktokAccessToken,
        }),
      })
    } catch {}
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: {
      tiktokUserId: null,
      tiktokUsername: null,
      tiktokDisplayName: null,
      tiktokAccessToken: null,
      tiktokRefreshToken: null,
      tiktokTokenExpiresAt: null,
      tiktokFollowerCount: null,
      tiktokVideoCount: null,
    },
  })

  return Response.json({ success: true })
}
