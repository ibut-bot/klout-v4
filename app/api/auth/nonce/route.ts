import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { generateNonce, buildSignMessage } from '@/lib/auth'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')
  if (!wallet || wallet.length < 32 || wallet.length > 44) {
    return Response.json(
      { success: false, error: 'INVALID_WALLET', message: 'Provide a valid wallet address as ?wallet=...' },
      { status: 400 }
    )
  }

  // Rate limit per wallet
  const rl = rateLimitResponse(`auth:${wallet}`, RATE_LIMITS.auth)
  if (rl) return rl

  const nonce = generateNonce()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

  // Clean up old nonces for this wallet
  await prisma.authNonce.deleteMany({
    where: { walletAddress: wallet, expiresAt: { lt: new Date() } },
  })

  await prisma.authNonce.create({
    data: { walletAddress: wallet, nonce, expiresAt },
  })

  return Response.json({
    success: true,
    nonce,
    message: buildSignMessage(nonce),
    expiresAt: expiresAt.toISOString(),
  })
}
