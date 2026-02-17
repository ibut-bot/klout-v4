import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { REFERRAL_TIERS } from '@/lib/referral'

/**
 * GET /api/referral — Referral dashboard data for the authenticated user.
 * Returns: referral code, referred users list, earnings breakdown, tier info.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referralCode: true, xScores: { take: 1, orderBy: { createdAt: 'desc' } } },
  })

  if (!user) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'User not found' }, { status: 404 })
  }

  const hasKloutScore = user.xScores.length > 0

  // Get all users this person referred
  const referrals = await prisma.referral.findMany({
    where: { referrerId: userId },
    include: {
      referredUser: {
        select: {
          id: true,
          walletAddress: true,
          username: true,
          xUsername: true,
          profilePicUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get earnings grouped by referral
  const earnings = await prisma.referralEarning.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: 'desc' },
  })

  // Aggregate earnings per referred user
  const earningsByUser: Record<string, { totalEarned: bigint; tokenBreakdown: Record<string, bigint>; count: number }> = {}
  let totalEarned = BigInt(0)

  for (const e of earnings) {
    if (!earningsByUser[e.referredUserId]) {
      earningsByUser[e.referredUserId] = { totalEarned: BigInt(0), tokenBreakdown: {}, count: 0 }
    }
    earningsByUser[e.referredUserId].totalEarned += e.referrerAmount
    const tokenKey = e.tokenMint || e.tokenType
    earningsByUser[e.referredUserId].tokenBreakdown[tokenKey] =
      (earningsByUser[e.referredUserId].tokenBreakdown[tokenKey] || BigInt(0)) + e.referrerAmount
    earningsByUser[e.referredUserId].count++
    totalEarned += e.referrerAmount
  }

  // Check if user was referred by someone
  const referredBy = await prisma.referral.findUnique({
    where: { referredUserId: userId },
    include: { referrer: { select: { username: true, xUsername: true, walletAddress: true } } },
  })

  const referredUsers = referrals.map(r => ({
    id: r.referredUser.id,
    wallet: r.referredUser.walletAddress,
    username: r.referredUser.username,
    xUsername: r.referredUser.xUsername,
    profilePicUrl: r.referredUser.profilePicUrl,
    tierNumber: r.tierNumber,
    referrerFeePct: r.referrerFeePct,
    completed: !!r.completedAt,
    completedAt: r.completedAt?.toISOString() || null,
    signedUpAt: r.createdAt.toISOString(),
    earnings: earningsByUser[r.referredUser.id]
      ? {
          totalEarned: earningsByUser[r.referredUser.id].totalEarned.toString(),
          paymentCount: earningsByUser[r.referredUser.id].count,
        }
      : { totalEarned: '0', paymentCount: 0 },
  }))

  return Response.json({
    success: true,
    referral: {
      code: user.referralCode,
      hasKloutScore,
      canRefer: hasKloutScore,
      totalReferred: referrals.length,
      completedReferrals: referrals.filter(r => r.completedAt).length,
      pendingReferrals: referrals.filter(r => !r.completedAt).length,
      totalEarned: totalEarned.toString(),
      referredUsers,
      referredBy: referredBy ? {
        username: referredBy.referrer.username,
        xUsername: referredBy.referrer.xUsername,
        wallet: referredBy.referrer.walletAddress,
        tierNumber: referredBy.tierNumber,
        referrerFeePct: referredBy.referrerFeePct,
        completed: !!referredBy.completedAt,
      } : null,
    },
  })
}
