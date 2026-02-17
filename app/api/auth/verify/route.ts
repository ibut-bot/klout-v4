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

  const { wallet, signature, nonce, referralCode } = body
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

  // Check if this is a brand-new user (for referral tracking)
  const existingUser = await prisma.user.findUnique({ where: { walletAddress: wallet } })
  const isNewUser = !existingUser

  // Upsert user (handle race condition on concurrent requests)
  try {
    await prisma.user.upsert({
      where: { walletAddress: wallet },
      update: {},
      create: { walletAddress: wallet },
    })
  } catch (e: any) {
    if (e.code !== 'P2002') throw e
  }

  // Process referral code for new users
  let referralApplied = false
  if (isNewUser && referralCode && typeof referralCode === 'string') {
    try {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: referralCode.toLowerCase() },
        include: { xScores: { take: 1, orderBy: { createdAt: 'desc' } } },
      })

      if (referrer && referrer.xScores.length > 0) {
        // Referrer must have a Klout score
        const newUser = await prisma.user.findUnique({ where: { walletAddress: wallet } })
        if (newUser && referrer.id !== newUser.id) {
          // Check user isn't already referred
          const existingReferral = await prisma.referral.findUnique({
            where: { referredUserId: newUser.id },
          })
          if (!existingReferral) {
            // Create a pending referral — tier/position assigned when user gets Klout score
            await prisma.referral.create({
              data: {
                referrerId: referrer.id,
                referredUserId: newUser.id,
                referralCode: referralCode.toLowerCase(),
                tierNumber: 0,
                referrerFeePct: 0,
                globalPosition: 0,
              },
            })
            referralApplied = true
          }
        }
      }
    } catch {
      // Referral processing failure should not block auth
    }
  }

  // Issue JWT
  const { token, expiresAt } = await issueToken(wallet)

  return Response.json({
    success: true,
    token,
    expiresAt,
    wallet,
    referralApplied,
  })
}
