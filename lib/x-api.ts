import { prisma } from './db'
import crypto from 'crypto'

// ── X OAuth 2.0 PKCE helpers ──

const X_CLIENT_ID = process.env.AUTH_TWITTER_ID || ''
const X_CLIENT_SECRET = process.env.AUTH_TWITTER_SECRET || ''
const X_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/x/callback`

const X_AUTH_URL = 'https://twitter.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const X_USERINFO_URL = 'https://api.twitter.com/2/users/me'
const X_TWEET_URL = 'https://api.twitter.com/2/tweets'

/** Generate PKCE code verifier and challenge */
export function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/** Build the X OAuth 2.0 authorization URL */
export function buildAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: X_CLIENT_ID,
    redirect_uri: X_REDIRECT_URI,
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${X_AUTH_URL}?${params.toString()}`
}

/** Exchange authorization code for tokens */
export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const basicAuth = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: X_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`X token exchange failed: ${err}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/** Refresh an expired X access token */
export async function refreshXToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const basicAuth = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`X token refresh failed: ${err}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/** Fetch the authenticated X user profile */
export async function getXUserProfile(accessToken: string): Promise<{
  id: string
  username: string
  name: string
}> {
  const res = await fetch(`${X_USERINFO_URL}?user.fields=id,username,name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`X user profile fetch failed: ${err}`)
  }

  const { data } = await res.json()
  return { id: data.id, username: data.username, name: data.name }
}

// ── X Post / Tweet helpers ──

/** Extract post ID from an X/Twitter URL */
export function extractPostId(url: string): string | null {
  // Handles: https://x.com/user/status/123, https://twitter.com/user/status/123
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/)
  return match ? match[1] : null
}

export interface PostMedia {
  type: 'photo' | 'video' | 'animated_gif'
  url?: string            // direct URL for photos
  previewImageUrl?: string // thumbnail for videos/gifs
}

/** Fetch post metrics, content, and media from X API */
export async function getPostMetrics(postId: string, accessToken: string): Promise<{
  viewCount: number
  text: string
  authorId: string
  media: PostMedia[]
}> {
  const params = new URLSearchParams({
    'tweet.fields': 'public_metrics,text,author_id,attachments',
    'expansions': 'attachments.media_keys',
    'media.fields': 'url,preview_image_url,type',
  })

  const res = await fetch(`${X_TWEET_URL}/${postId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`X tweet fetch failed: ${err}`)
  }

  const json = await res.json()
  const data = json.data
  const includes = json.includes

  // Parse media from includes
  const media: PostMedia[] = (includes?.media ?? []).map((m: any) => ({
    type: m.type as PostMedia['type'],
    url: m.url || undefined,
    previewImageUrl: m.preview_image_url || undefined,
  }))

  return {
    viewCount: data.public_metrics?.impression_count ?? 0,
    text: data.text,
    authorId: data.author_id,
    media,
  }
}

/** Get a valid access token for a user, refreshing if expired */
export async function getValidXToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xAccessToken: true, xRefreshToken: true, xTokenExpiresAt: true },
  })

  if (!user?.xAccessToken || !user?.xRefreshToken) return null

  // If token is still valid (with 5 min buffer), return it
  if (user.xTokenExpiresAt && user.xTokenExpiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return user.xAccessToken
  }

  // Refresh the token
  try {
    const refreshed = await refreshXToken(user.xRefreshToken)
    await prisma.user.update({
      where: { id: userId },
      data: {
        xAccessToken: refreshed.accessToken,
        xRefreshToken: refreshed.refreshToken,
        xTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
      },
    })
    return refreshed.accessToken
  } catch {
    return null
  }
}
