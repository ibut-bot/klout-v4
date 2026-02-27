import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import crypto from 'crypto'

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_ID || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const REDIRECT_URI = `${APP_URL}/api/auth/tiktok/callback`

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const returnTo = new URL(request.url).searchParams.get('returnTo') || '/tasks'

  const state = crypto.randomBytes(16).toString('hex')
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'user.info.basic',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`

  const cookiePayload = JSON.stringify({
    state,
    codeVerifier,
    userId: auth.userId,
    returnTo,
  })
  const encoded = Buffer.from(cookiePayload).toString('base64')

  const response = NextResponse.json({ success: true, authUrl })
  response.cookies.set('tiktok_oauth_state', encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
