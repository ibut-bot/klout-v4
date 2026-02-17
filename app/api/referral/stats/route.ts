import { getReferralProgramStatus } from '@/lib/referral'

/**
 * GET /api/referral/stats — Public referral program stats (for progress bar).
 * No auth required.
 */
export async function GET() {
  const status = await getReferralProgramStatus()

  return Response.json({
    success: true,
    stats: {
      totalReferrals: status.totalReferrals,
      maxReferrals: 231000,
      isActive: status.isActive,
      currentTier: status.currentTier
        ? {
            tier: status.currentTier.tier,
            referrerFeePct: status.currentTier.referrerFeePct,
            platformFeePct: status.currentTier.platformFeePct,
            usersInTier: status.currentTier.usersInTier,
            usersFilledInTier: status.usersInCurrentTier,
            remainingInTier: status.remainingInCurrentTier,
          }
        : null,
      tiers: status.tiers.map(t => ({
        tier: t.tier,
        usersInTier: t.usersInTier,
        referrerFeePct: t.referrerFeePct,
        platformFeePct: t.platformFeePct,
        cumulativeStart: t.cumulativeStart,
        cumulativeEnd: t.cumulativeEnd,
      })),
    },
  })
}
