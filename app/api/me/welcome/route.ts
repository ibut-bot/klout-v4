import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

/** GET /api/me/welcome — Check if the welcome modal has been shown. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { welcomeShown: true },
  })

  return Response.json({ success: true, welcomeShown: user?.welcomeShown ?? false })
}

/** POST /api/me/welcome — Mark the welcome modal as shown. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  await prisma.user.update({
    where: { id: auth.userId },
    data: { welcomeShown: true },
  })

  return Response.json({ success: true })
}
