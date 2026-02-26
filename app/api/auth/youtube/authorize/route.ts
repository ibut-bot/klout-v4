import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import crypto from 'crypto'

const GOOGLE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const REDIRECT_URI = `${APP_URL}/api/auth/youtube/callback`

/**
 * GET /api/auth/youtube/authorize
 * Starts the Google OAuth 2.0 flow for YouTube channel linking.
 * Returns a redirect URL to Google's authorization page.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const returnTo = new URL(request.url).searchParams.get('returnTo') || '/tasks'

  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    access_type: 'online',
    state,
    prompt: 'consent',
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  const cookiePayload = JSON.stringify({ state, userId: auth.userId, returnTo })
  const encoded = Buffer.from(cookiePayload).toString('base64')

  const response = NextResponse.json({ success: true, authUrl })
  response.cookies.set('yt_oauth_state', encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
