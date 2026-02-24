import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getScoreLabel, getGeoTierLabel } from '@/lib/klout-scoring'

/**
 * GET /api/klout-score
 *
 * Returns the authenticated user's most recent Klout score (if any).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth instanceof Response) return auth
    const { userId } = auth

    const latest = await prisma.xScoreData.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    if (!latest) {
      return Response.json({ success: true, score: null })
    }

    return Response.json({
      success: true,
      score: {
        id: latest.id,
        totalScore: latest.totalScore,
        label: getScoreLabel(latest.totalScore),
        breakdown: {
          reach: { score: latest.reachScore, followers: latest.followersCount },
          engagement: {
            score: latest.engagementScore,
            avgLikes: latest.avgLikes,
            avgRetweets: latest.avgRetweets,
            avgReplies: latest.avgReplies,
            avgViews: latest.avgViews,
            tweetsAnalyzed: latest.tweetsAnalyzed,
          },
          ratio: { score: latest.ratioScore, followers: latest.followersCount, following: latest.followingCount },
          verification: { score: latest.verificationScore, type: latest.verifiedType },
          geo: {
            multiplier: latest.geoMultiplier,
            tier: latest.geoTier,
            tierLabel: getGeoTierLabel(latest.geoTier),
            location: latest.location,
          },
        },
        qualityScore: latest.qualityScore,
        buffedImageUrl: latest.buffedImageUrl,
        tierQuote: latest.tierQuote,
        xUsername: latest.xUsername,
        profileImageUrl: latest.profileImageUrl,
        createdAt: latest.createdAt.toISOString(),
      },
    })
  } catch (err: any) {
    console.error('[klout-score] Unhandled error:', err)
    return Response.json(
      { success: false, error: 'INTERNAL_ERROR', message: err?.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
