import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getValidXToken, getXUserProfileFull, getRecentTweets } from '@/lib/x-api'
import { verifyPaymentTx } from '@/lib/solana/verify-tx'
import { calculateKloutScore, getScoreLabel, getGeoTierLabel } from '@/lib/klout-scoring'
import { generateBuffedProfileImage } from '@/lib/fal'
import { getRandomQuote } from '@/lib/score-tiers'
import { getTotalReferralCount, getCurrentTier, isReferralProgramActive } from '@/lib/referral'

// Allow up to 60s for Solana + X API calls
export const maxDuration = 60

const SYSTEM_WALLET = process.env.SYSTEM_WALLET_ADDRESS || ''
const KLOUT_SCORE_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_KLOUT_SCORE_FEE_LAMPORTS || 10_000_000)

/**
 * POST /api/klout-score/calculate
 *
 * Calculate a Klout score for the authenticated user's linked X account.
 * Flow:
 * 1. Verify user is authenticated and has linked X account
 * 2. Verify 0.01 SOL fee payment to system wallet
 * 3. Fetch extended X profile (followers, following, verified, location)
 * 4. Fetch last 20 original tweets with metrics
 * 5. Compute score using hybrid multiplicative model
 * 6. Store raw data + score in XScoreData table
 * 7. Return score breakdown
 */
export async function POST(request: NextRequest) {
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

  // 4. Get valid X token
  const accessToken = await getValidXToken(userId)
  if (!accessToken) {
    return Response.json(
      { success: false, error: 'X_TOKEN_EXPIRED', message: 'Your X account token has expired. Please re-link your X account.' },
      { status: 401 }
    )
  }

  // 5. Fetch X profile with metrics
  let profile
  try {
    profile = await getXUserProfileFull(accessToken)
  } catch (err: any) {
    return Response.json(
      { success: false, error: 'X_API_ERROR', message: `Failed to fetch X profile: ${err.message}` },
      { status: 502 }
    )
  }

  // 6. Fetch recent tweets
  let tweetsResult
  try {
    tweetsResult = await getRecentTweets(profile.id, accessToken, 20)
  } catch (err: any) {
    return Response.json(
      { success: false, error: 'X_API_ERROR', message: `Failed to fetch tweets: ${err.message}` },
      { status: 502 }
    )
  }

  const { tweets, raw: rawTweetsData } = tweetsResult

  // 7. Compute score
  const scoreBreakdown = calculateKloutScore(profile, tweets)

  // Compute averages for storage
  const tweetsCount = tweets.length
  const avgLikes = tweetsCount > 0 ? tweets.reduce((s, t) => s + t.likeCount, 0) / tweetsCount : 0
  const avgRetweets = tweetsCount > 0 ? tweets.reduce((s, t) => s + t.retweetCount, 0) / tweetsCount : 0
  const avgReplies = tweetsCount > 0 ? tweets.reduce((s, t) => s + t.replyCount, 0) / tweetsCount : 0
  const avgViews = tweetsCount > 0 ? tweets.reduce((s, t) => s + t.viewCount, 0) / tweetsCount : 0

  // 8. Generate buffed profile image (non-blocking — don't fail the score if this fails)
  let buffedImageUrl: string | null = null
  try {
    buffedImageUrl = await generateBuffedProfileImage(profile.profileImageUrl, profile.username, scoreBreakdown.totalScore)
  } catch (err) {
    console.error('[klout-score] Buffed image generation failed (non-fatal):', err)
  }

  // 9. Mark referral as completed and assign tier/position (user now has a Klout score)
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

  // 10. Store in database
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
      geoTier: scoreBreakdown.geoTier,
      geoRegion: scoreBreakdown.geoRegion,
      tweetsAnalyzed: tweetsCount,
      avgLikes,
      avgRetweets,
      avgReplies,
      avgViews,
      rawProfileData: profile.raw,
      rawTweetsData,
      reachScore: scoreBreakdown.reachScore,
      ratioScore: scoreBreakdown.ratioScore,
      engagementScore: scoreBreakdown.engagementScore,
      verificationScore: scoreBreakdown.verificationScore,
      geoMultiplier: scoreBreakdown.geoMultiplier,
      qualityScore: scoreBreakdown.qualityScore,
      totalScore: scoreBreakdown.totalScore,
      buffedImageUrl,
      tierQuote: getRandomQuote(scoreBreakdown.totalScore),
      feeTxSignature: feeTxSig,
    },
  })

  // 11. Upsert into leaderboard and recalculate ranks
  try {
    const existingEntry = await prisma.kloutScore.findFirst({
      where: { twitterId: profile.id },
    })

    if (existingEntry) {
      await prisma.kloutScore.update({
        where: { id: existingEntry.id },
        data: {
          score: scoreBreakdown.totalScore,
          name: profile.name,
          username: profile.username,
          image: profile.profileImageUrl,
        },
      })
    } else {
      await prisma.kloutScore.create({
        data: {
          id: userId,
          name: profile.name,
          username: profile.username,
          image: profile.profileImageUrl,
          twitterId: profile.id,
          score: scoreBreakdown.totalScore,
          rank: 0,
        },
      })
    }

    await prisma.$executeRawUnsafe(`
      UPDATE "slopwork"."KloutScore" k
      SET rank = r.new_rank
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) as new_rank
        FROM "slopwork"."KloutScore"
      ) r
      WHERE k.id = r.id
    `)
  } catch (err) {
    console.error('[klout-score] Leaderboard update failed (non-fatal):', err)
  }

  return Response.json({
    success: true,
    score: {
      id: scoreData.id,
      totalScore: scoreData.totalScore,
      label: getScoreLabel(scoreData.totalScore),
      buffedImageUrl: scoreData.buffedImageUrl,
      tierQuote: scoreData.tierQuote,
      breakdown: {
        reach: { score: scoreBreakdown.reachScore, followers: profile.followersCount },
        engagement: { score: scoreBreakdown.engagementScore, avgLikes, avgRetweets, avgReplies, avgViews, tweetsAnalyzed: tweetsCount },
        ratio: { score: scoreBreakdown.ratioScore, followers: profile.followersCount, following: profile.followingCount },
        verification: { score: scoreBreakdown.verificationScore, type: profile.verifiedType },
        geo: {
          multiplier: scoreBreakdown.geoMultiplier,
          tier: scoreBreakdown.geoTier,
          tierLabel: getGeoTierLabel(scoreBreakdown.geoTier),
          location: profile.location,
        },
      },
      qualityScore: scoreBreakdown.qualityScore,
    },
  }, { status: 201 })
}
