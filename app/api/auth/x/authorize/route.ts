import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { generatePKCE, buildAuthUrl, revokeXToken } from '@/lib/x-api'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

/**
 * GET /api/auth/x/authorize
 * Starts the X OAuth 2.0 PKCE flow. Requires wallet auth.
 * Returns a redirect URL to X's authorization page.
 * Stores state + code_verifier in a secure httpOnly cookie.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const returnTo = new URL(request.url).searchParams.get('returnTo') || '/my-score'

  // Revoke any existing X token so X shows the account picker
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { xAccessToken: true },
  })
  if (user?.xAccessToken) {
    await revokeXToken(user.xAccessToken)
  }

  const state = crypto.randomBytes(16).toString('hex')
  const { verifier, challenge } = generatePKCE()

  const authUrl = buildAuthUrl(state, challenge)

  // Store state + verifier + userId + returnTo in a cookie
  const cookiePayload = JSON.stringify({ state, verifier, userId: auth.userId, returnTo })
  const encoded = Buffer.from(cookiePayload).toString('base64')

  const response = NextResponse.json({ success: true, authUrl })
  response.cookies.set('x_oauth_state', encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}
