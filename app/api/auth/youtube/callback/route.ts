import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const GOOGLE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const REDIRECT_URI = `${APP_URL}/api/auth/youtube/callback`

/**
 * GET /api/auth/youtube/callback
 * Handles the Google OAuth 2.0 callback.
 * Exchanges the code for a token, fetches the user's YouTube channel,
 * and links it to their account.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const defaultRedirect = '/tasks'

  function buildRedirectUrl(basePath: string, params: string) {
    return `${APP_URL}${basePath}${basePath.includes('?') ? '&' : '?'}${params}`
  }

  let returnTo = defaultRedirect
  const cookieValue = request.cookies.get('yt_oauth_state')?.value
  if (cookieValue) {
    try {
      const parsed = JSON.parse(Buffer.from(cookieValue, 'base64').toString())
      if (parsed.returnTo) returnTo = parsed.returnTo
    } catch {}
  }

  if (error) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, `yt_link=error&reason=${error}`))
  }

  if (!code || !state) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'yt_link=error&reason=missing_params'))
  }

  if (!cookieValue) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'yt_link=error&reason=expired_session'))
  }

  let cookieData: { state: string; userId: string; returnTo?: string }
  try {
    cookieData = JSON.parse(Buffer.from(cookieValue, 'base64').toString())
    if (cookieData.returnTo) returnTo = cookieData.returnTo
  } catch {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'yt_link=error&reason=invalid_session'))
  }

  if (cookieData.state !== state) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'yt_link=error&reason=state_mismatch'))
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('Google token exchange failed:', err)
      return NextResponse.redirect(buildRedirectUrl(returnTo, 'yt_link=error&reason=token_exchange_failed'))
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    // Fetch the user's YouTube channel
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!channelRes.ok) {
      const err = await channelRes.text()
      console.error('YouTube channel fetch failed:', err)
      return NextResponse.redirect(buildRedirectUrl(returnTo, 'yt_link=error&reason=channel_fetch_failed'))
    }

    const channelData = await channelRes.json()

    if (!channelData.items || channelData.items.length === 0) {
      return NextResponse.redirect(buildRedirectUrl(returnTo, 'yt_link=error&reason=no_channel'))
    }

    const channel = channelData.items[0]
    const channelId = channel.id
    const channelTitle = channel.snippet.title

    // Check if this channel is already linked to another user
    const existingLink = await prisma.user.findUnique({
      where: { youtubeChannelId: channelId },
      select: { id: true },
    })

    if (existingLink && existingLink.id !== cookieData.userId) {
      return NextResponse.redirect(buildRedirectUrl(returnTo, 'yt_link=error&reason=already_linked'))
    }

    await prisma.user.update({
      where: { id: cookieData.userId },
      data: { youtubeChannelId: channelId, youtubeChannelTitle: channelTitle },
    })

    const response = NextResponse.redirect(
      buildRedirectUrl(returnTo, `yt_link=success&yt_channel=${encodeURIComponent(channelTitle)}`)
    )
    response.cookies.delete('yt_oauth_state')
    return response
  } catch (err) {
    console.error('YouTube OAuth callback error:', err)
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'yt_link=error&reason=unexpected_error'))
  }
}
