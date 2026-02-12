import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'

/**
 * DELETE /api/auth/x/unlink
 * Removes the X account link from the authenticated user.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

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
