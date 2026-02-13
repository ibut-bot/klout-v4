import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { revokeXToken } from '@/lib/x-api'

/**
 * DELETE /api/auth/x/unlink
 * Removes the X account link from the authenticated user.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  // Revoke the token with X before clearing locally
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { xAccessToken: true },
  })
  if (user?.xAccessToken) {
    await revokeXToken(user.xAccessToken)
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: {
      xUserId: null,
      xUsername: null,
      xAccessToken: null,
      xRefreshToken: null,
      xTokenExpiresAt: null,
    },
  })

  return Response.json({ success: true, message: 'X account unlinked' })
}
