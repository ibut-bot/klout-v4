import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getXUserProfile } from '@/lib/x-api'
import { prisma } from '@/lib/db'

/**
 * GET /api/auth/x/callback
 * Handles the OAuth 2.0 callback from X.
 * Exchanges the code for tokens, fetches the X profile,
 * and links the X account to the wallet-authenticated user.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const defaultRedirect = '/my-score'

  function buildRedirectUrl(basePath: string, params: string) {
    return `${appUrl}${basePath}${basePath.includes('?') ? '&' : '?'}${params}`
  }

  // Try to extract returnTo from cookie early for error redirects
  let returnTo = defaultRedirect
  const cookieValue = request.cookies.get('x_oauth_state')?.value
  if (cookieValue) {
    try {
      const parsed = JSON.parse(Buffer.from(cookieValue, 'base64').toString())
      if (parsed.returnTo) returnTo = parsed.returnTo
    } catch {}
  }

  if (error) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, `x_link=error&reason=${error}`))
  }

  if (!code || !state) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'x_link=error&reason=missing_params'))
  }

  if (!cookieValue) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'x_link=error&reason=expired_session'))
  }

  let cookieData: { state: string; verifier: string; userId: string; returnTo?: string }
  try {
    cookieData = JSON.parse(Buffer.from(cookieValue, 'base64').toString())
    if (cookieData.returnTo) returnTo = cookieData.returnTo
  } catch {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'x_link=error&reason=invalid_session'))
  }

  if (cookieData.state !== state) {
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'x_link=error&reason=state_mismatch'))
  }

  try {
    const tokens = await exchangeCodeForTokens(code, cookieData.verifier)
    const xProfile = await getXUserProfile(tokens.accessToken)

    const existingLink = await prisma.user.findUnique({
      where: { xUserId: xProfile.id },
      select: { id: true },
    })

    if (existingLink && existingLink.id !== cookieData.userId) {
      return NextResponse.redirect(buildRedirectUrl(returnTo, 'x_link=error&reason=already_linked'))
    }

    await prisma.user.update({
      where: { id: cookieData.userId },
      data: {
        xUserId: xProfile.id,
        xUsername: xProfile.username,
        xAccessToken: tokens.accessToken,
        xRefreshToken: tokens.refreshToken,
        xTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      },
    })

    const response = NextResponse.redirect(buildRedirectUrl(returnTo, `x_link=success&x_username=${xProfile.username}`))
    response.cookies.delete('x_oauth_state')
    return response
  } catch (err) {
    console.error('X OAuth callback error:', err)
    return NextResponse.redirect(buildRedirectUrl(returnTo, 'x_link=error&reason=token_exchange_failed'))
  }
}
