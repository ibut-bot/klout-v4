import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getValidXToken, getXUserProfileFull } from '@/lib/x-api'
import { verifyPaymentTx } from '@/lib/solana/verify-tx'
import { generateBuffedProfileImage } from '@/lib/fal'
import { getRandomQuote, getScoreTierTitle as getScoreLabel } from '@/lib/score-tiers'
import { getTotalReferralCount, getCurrentTier, isReferralProgramActive } from '@/lib/referral'
import { fetchWallchainScore, applyScoreDeviation, followRatioMultiplier } from '@/lib/wallchain'

export const maxDuration = 120

const SYSTEM_WALLET = process.env.SYSTEM_WALLET_ADDRESS || ''
const KLOUT_SCORE_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_KLOUT_SCORE_FEE_LAMPORTS || 10_000_000)

/**
 * POST /api/klout-score/calculate
 *
 * Calculate a Klout score using the Wallchain X Score API (server-side).
 * Wallchain scores (0–1,000) are scaled ×10 to our 0–10,000 range
 * with a ±5% random deviation applied.
 */
export async function POST(request: NextRequest) {
  try {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { feeTxSig } = body

  if (!feeTxSig) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: feeTxSig' },
      { status: 400 }
    )
  }

  // 1. Check user has linked X account
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, xUserId: true, xUsername: true },
  })

  if (!user?.xUserId) {
    return Response.json(
      { success: false, error: 'X_NOT_LINKED', message: 'You must link your X account before calculating your Klout score' },
      { status: 400 }
    )
  }

  // 2. Check that this tx signature hasn't been used before
  const existingScore = await prisma.xScoreData.findUnique({
    where: { feeTxSignature: feeTxSig },
  })

  if (existingScore) {
    return Response.json(
      { success: false, error: 'DUPLICATE_TX', message: 'This transaction has already been used for a score calculation' },
      { status: 409 }
    )
  }

  // 3. Verify fee payment
  if (!SYSTEM_WALLET) {
    return Response.json(
      { success: false, error: 'SERVER_CONFIG_ERROR', message: 'System wallet not configured' },
      { status: 503 }
    )
  }

  const feeVerification = await verifyPaymentTx(feeTxSig, SYSTEM_WALLET, KLOUT_SCORE_FEE_LAMPORTS)
  if (!feeVerification.valid) {
    return Response.json(
      { success: false, error: 'INVALID_PAYMENT', message: feeVerification.error || 'Fee payment verification failed' },
      { status: 400 }
    )
  }

  // 4. Get valid X token & fetch profile (server-side — for profile image + stored data)
  const accessToken = await getValidXToken(userId)
  if (!accessToken) {
    return Response.json(
      { success: false, error: 'X_TOKEN_EXPIRED', message: 'Your X account token has expired. Please re-link your X account.' },
      { status: 401 }
    )
  }

  let profile
  try {
    profile = await getXUserProfileFull(accessToken)
  } catch (err: any) {
    return Response.json(
      { success: false, error: 'X_API_ERROR', message: `Failed to fetch X profile: ${err.message}` },
      { status: 502 }
    )
  }

  // 5. Fetch score from Wallchain API (server-side only)
  let wallchainScore: number
  try {
    wallchainScore = await fetchWallchainScore(user.xUsername!)
  } catch (err: any) {
    return Response.json(
      { success: false, error: 'SCORE_API_ERROR', message: `Failed to fetch score: ${err.message}` },
      { status: 502 }
    )
  }

  // 6. Scale 0–1,000 → 0–10,000, apply ±5% deviation, penalties for no blue tick and follow ratio
  const scaledScore = wallchainScore * 10
  let totalScore = applyScoreDeviation(scaledScore)
  if (profile.verifiedType !== 'blue') {
    totalScore = Math.round(totalScore * 0.10)
  }
  totalScore = Math.round(totalScore * followRatioMultiplier(profile.followersCount, profile.followingCount))
  const qualityScore = totalScore / 10_000

  // 7. Generate buffed profile image using X profile pic as base reference
  let buffedImageUrl: string | null = null
  try {
    buffedImageUrl = await generateBuffedProfileImage(profile.profileImageUrl, profile.username, totalScore)
  } catch (err) {
    console.error('[klout-score] Buffed image generation failed (non-fatal):', err)
  }

  // 8. Mark referral as completed and assign tier/position (user now has a Klout score)
  try {
    const pendingReferral = await prisma.referral.findUnique({
      where: { referredUserId: userId },
    })
    if (pendingReferral && !pendingReferral.completedAt) {
      const totalCompleted = await getTotalReferralCount()
      if (isReferralProgramActive(totalCompleted)) {
        const position = totalCompleted + 1
        const tier = getCurrentTier(totalCompleted)
        if (tier) {
          await prisma.referral.update({
            where: { id: pendingReferral.id },
            data: {
              completedAt: new Date(),
              globalPosition: position,
              tierNumber: tier.tier,
              referrerFeePct: tier.referrerFeePct,
            },
          })
        }
      } else {
        // Program ended — mark completed but no fee share
        await prisma.referral.update({
          where: { id: pendingReferral.id },
          data: { completedAt: new Date() },
        })
      }
    }
  } catch {
    // Non-fatal: don't block score calculation
  }

  // 9. Store in database
  const scoreData = await prisma.xScoreData.create({
    data: {
      userId,
      xUserId: profile.id,
      xUsername: profile.username,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      tweetCount: profile.tweetCount,
      listedCount: profile.listedCount,
      verifiedType: profile.verifiedType,
      location: profile.location,
      profileImageUrl: profile.profileImageUrl,
      tweetsAnalyzed: 0,
      avgLikes: 0,
      avgRetweets: 0,
      avgReplies: 0,
      avgViews: 0,
      rawProfileData: { ...profile.raw, wallchainScore, scaledScore, totalScore },
      reachScore: 0,
      ratioScore: 0,
      engagementScore: 0,
      verificationScore: 0,
      geoMultiplier: 0,
      qualityScore,
      totalScore,
      buffedImageUrl,
      tierQuote: getRandomQuote(totalScore),
      feeTxSignature: feeTxSig,
    },
  })

  return Response.json({
    success: true,
    score: {
      id: scoreData.id,
      totalScore: scoreData.totalScore,
      label: getScoreLabel(scoreData.totalScore),
      buffedImageUrl: scoreData.buffedImageUrl,
      tierQuote: scoreData.tierQuote,
      breakdown: {
        reach: { score: 0, followers: profile.followersCount },
        engagement: { score: 0, avgLikes: 0, avgRetweets: 0, avgReplies: 0, avgViews: 0, tweetsAnalyzed: 0 },
        ratio: { score: 0, followers: profile.followersCount, following: profile.followingCount },
        verification: { score: 0, type: profile.verifiedType },
        geo: { multiplier: 0, tier: null, tierLabel: 'N/A', location: profile.location },
      },
      qualityScore,
    },
  }, { status: 201 })
  } catch (err: any) {
    console.error('[klout-score/calculate] Unhandled error:', err)
    return Response.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
