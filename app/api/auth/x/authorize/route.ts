import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { generatePKCE, buildAuthUrl } from '@/lib/x-api'
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

  const state = crypto.randomBytes(16).toString('hex')
  const { verifier, challenge } = generatePKCE()

  const authUrl = buildAuthUrl(state, challenge)

  // Store state + verifier + userId in a cookie (encrypted-ish via httpOnly + short TTL)
  const cookiePayload = JSON.stringify({ state, verifier, userId: auth.userId })
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
