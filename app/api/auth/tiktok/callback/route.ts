import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_ID || ''
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const REDIRECT_URI = `${APP_URL}/api/auth/tiktok/callback`

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
  const cookieValue = request.cookies.get('tiktok_oauth_state')?.value
  if (cookieValue) {
    try {
      const parsed = JSON.parse(Buffer.from(cookieValue, 'base64').toString())
      if (parsed.returnTo) returnTo = parsed.returnTo
    } catch {}
  }

  if (error) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, `tiktok_link=error&reason=${error}`))
  }

  if (!code || !state) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'tiktok_link=error&reason=missing_params'))
  }

  if (!cookieValue) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'tiktok_link=error&reason=expired_session'))
  }

  let cookieData: { state: string; codeVerifier: string; userId: string; returnTo?: string }
  try {
    cookieData = JSON.parse(Buffer.from(cookieValue, 'base64').toString())
    if (cookieData.returnTo) returnTo = cookieData.returnTo
  } catch {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'tiktok_link=error&reason=invalid_session'))
  }

  if (cookieData.state !== state) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'tiktok_link=error&reason=state_mismatch'))
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code_verifier: cookieData.codeVerifier,
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('TikTok token exchange failed:', err)
      return NextResponse.redirect(buildRedirectUrl(returnTo, 'tiktok_link=error&reason=token_exchange_failed'))
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const expiresIn = tokenData.expires_in
    const openId = tokenData.open_id

    if (!accessToken || !openId) {
      console.error('TikTok token response missing fields:', tokenData)
      return NextResponse.redirect(buildRedirectUrl(returnTo, 'tiktok_link=error&reason=invalid_token_response'))
    }

    // Fetch user profile
    const profileRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    let tiktokUsername = openId
    let tiktokDisplayName = ''
    let followerCount: number | null = null
    let videoCount: number | null = null

    if (profileRes.ok) {
      const profileData = await profileRes.json()
      const user = profileData.data?.user
      if (user) {
        tiktokUsername = user.display_name || openId
        tiktokDisplayName = user.display_name || ''
      }
    } else {
      console.error('TikTok profile fetch failed (non-critical):', await profileRes.text())
    }

    const tiktokUserId = openId

    // Check if this TikTok account is already linked to another user
    const existingLink = await prisma.user.findUnique({
      where: { tiktokUserId },
      select: { id: true },
    })

    if (existingLink && existingLink.id !== cookieData.userId) {
      return NextResponse.redirect(buildRedirectUrl(returnTo, 'tiktok_link=error&reason=already_linked'))
    }

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000)

    await prisma.user.update({
      where: { id: cookieData.userId },
      data: {
        tiktokUserId,
        tiktokUsername,
        tiktokDisplayName,
        tiktokAccessToken: accessToken,
        tiktokRefreshToken: refreshToken,
        tiktokTokenExpiresAt: tokenExpiresAt,
        tiktokFollowerCount: followerCount,
        tiktokVideoCount: videoCount,
      },
    })

    const response = NextResponse.redirect(
      buildRedirectUrl(returnTo, `tiktok_link=success&tiktok_user=${encodeURIComponent(tiktokUsername)}`)
    )
    response.cookies.delete('tiktok_oauth_state')
    return response
  } catch (err) {
    console.error('TikTok OAuth callback error:', err)
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'tiktok_link=error&reason=unexpected_error'))
  }
}
