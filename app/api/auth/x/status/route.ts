import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'

/**
 * GET /api/auth/x/status
 * Returns the X account link status for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { xUserId: true, xUsername: true },
  })

  return Response.json({
    success: true,
    linked: Boolean(user?.xUserId),
    xUsername: user?.xUsername || null,
  })
}
