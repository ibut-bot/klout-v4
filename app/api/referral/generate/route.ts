import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

/**
 * POST /api/referral/generate — Generate a referral code for the authenticated user.
 * Uses the user's X/Twitter username as the referral code so the link reads nicely.
 * Requires the user to have a Klout score (which requires a linked X account).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referralCode: true, xUsername: true, xScores: { take: 1 } },
  })

  if (!user) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'User not found' }, { status: 404 })
  }

  if (user.xScores.length === 0) {
    return Response.json(
      { success: false, error: 'NO_KLOUT_SCORE', message: 'You need a Klout score before you can refer others. Calculate your score first.' },
      { status: 400 }
    )
  }

  if (!user.xUsername) {
    return Response.json(
      { success: false, error: 'X_NOT_LINKED', message: 'You need a linked X account to generate a referral code.' },
      { status: 400 }
    )
  }

  // If user already has a code, return it
  if (user.referralCode) {
    return Response.json({ success: true, code: user.referralCode })
  }

  // Use their X username (lowercased) as the referral code
  const code = user.xUsername.toLowerCase()

  // Check for collision (another user somehow has the same code)
  const existing = await prisma.user.findUnique({ where: { referralCode: code } })
  if (existing) {
    return Response.json(
      { success: false, error: 'CODE_TAKEN', message: 'Referral code conflict. Please contact support.' },
      { status: 409 }
    )
  }

  await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
  })

  return Response.json({ success: true, code })
}
