import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWalletSignature, issueToken } from '@/lib/auth'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { wallet, signature, nonce } = body
  if (!wallet || !signature || !nonce) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: wallet, signature, nonce' },
      { status: 400 }
    )
  }

  // Rate limit
  const rl = rateLimitResponse(`auth:${wallet}`, RATE_LIMITS.auth)
  if (rl) return rl

  // Look up nonce
  const nonceRecord = await prisma.authNonce.findUnique({ where: { nonce } })
  if (!nonceRecord || nonceRecord.walletAddress !== wallet) {
    return Response.json(
      { success: false, error: 'INVALID_NONCE', message: 'Nonce not found or does not match wallet' },
      { status: 401 }
    )
  }

  if (nonceRecord.expiresAt < new Date()) {
    await prisma.authNonce.delete({ where: { id: nonceRecord.id } })
    return Response.json(
      { success: false, error: 'NONCE_EXPIRED', message: 'Nonce has expired. Request a new one.' },
      { status: 401 }
    )
  }

  // Verify signature
  const valid = verifyWalletSignature(wallet, signature, nonce)
  if (!valid) {
    return Response.json(
      { success: false, error: 'INVALID_SIGNATURE', message: 'Wallet signature verification failed' },
      { status: 401 }
    )
  }

  // Consume nonce
  await prisma.authNonce.delete({ where: { id: nonceRecord.id } })

  // Upsert user (handle race condition on concurrent requests)
  try {
    await prisma.user.upsert({
      where: { walletAddress: wallet },
      update: {},
      create: { walletAddress: wallet },
    })
  } catch (e: any) {
    // P2002 = unique constraint violation (concurrent insert race)
    if (e.code !== 'P2002') throw e
  }

  // Issue JWT
  const { token, expiresAt } = await issueToken(wallet)

  return Response.json({
    success: true,
    token,
    expiresAt,
    wallet,
  })
}
