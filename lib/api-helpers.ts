import { authenticateRequest } from './auth'
import { prisma } from './db'

/** Authenticate request and return wallet + userId, or an error Response */
export async function requireAuth(request: Request): Promise<
  { wallet: string; userId: string } | Response
> {
  const wallet = await authenticateRequest(request)
  if (!wallet) {
    return Response.json(
      { success: false, error: 'UNAUTHORIZED', message: 'Valid JWT required. Get one from /api/auth/verify' },
      { status: 401 }
    )
  }

  const user = await prisma.user.findUnique({ where: { walletAddress: wallet } })
  if (!user) {
    return Response.json(
      { success: false, error: 'USER_NOT_FOUND', message: 'Authenticated wallet has no user record' },
      { status: 401 }
    )
  }

  return { wallet, userId: user.id }
}
