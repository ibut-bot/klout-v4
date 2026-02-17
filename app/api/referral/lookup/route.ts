import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getReferralInfoForUser } from '@/lib/referral'

/**
 * GET /api/referral/lookup?userId=...
 *
 * Lookup referral info for a user (used by payment components to determine
 * if the task performer was referred and what fee split to use).
 * Auth required (only campaign creators / task creators need this).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId) {
    return Response.json(
      { success: false, error: 'MISSING_PARAMS', message: 'Required query param: userId' },
      { status: 400 }
    )
  }

  const info = await getReferralInfoForUser(userId)

  if (!info) {
    return Response.json({
      success: true,
      referral: null,
    })
  }

  return Response.json({
    success: true,
    referral: {
      referrerWallet: info.referrerWallet,
      referrerFeePct: info.referrerFeePct,
      tierNumber: info.tierNumber,
    },
  })
}
