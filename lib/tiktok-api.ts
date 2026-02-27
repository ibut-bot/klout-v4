import { prisma } from '@/lib/db'

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_ID || ''
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || ''

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Extract TikTok video ID from various URL formats */
export function extractTikTokVideoId(url: string): string | null {
  const patterns = [
    /tiktok\.com\/@[^/]+\/video\/(\d+)/,
    /tiktok\.com\/t\/([a-zA-Z0-9]+)/,
    /vm\.tiktok\.com\/([a-zA-Z0-9]+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

/** Refresh a TikTok access token using the refresh token */
async function refreshTikTokToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TikTok token refresh failed (${res.status}): ${err}`)
  }

  return res.json()
}

/** Get a valid TikTok access token for a user, refreshing if needed */
export async function getValidTikTokToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tiktokAccessToken: true,
      tiktokRefreshToken: true,
      tiktokTokenExpiresAt: true,
    },
  })

  if (!user?.tiktokAccessToken || !user?.tiktokRefreshToken) return null

  const now = Date.now()
  const expiresAt = user.tiktokTokenExpiresAt?.getTime() ?? 0

  if (now < expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return user.tiktokAccessToken
  }

  try {
    const tokens = await refreshTikTokToken(user.tiktokRefreshToken)
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    await prisma.user.update({
      where: { id: userId },
      data: {
        tiktokAccessToken: tokens.access_token,
        tiktokRefreshToken: tokens.refresh_token,
        tiktokTokenExpiresAt: newExpiresAt,
      },
    })

    return tokens.access_token
  } catch (err) {
    console.error('Failed to refresh TikTok token:', err)
    return null
  }
}

export interface TikTokVideoMetrics {
  videoId: string
  title: string
  description: string
  createTime: number
  coverImageUrl: string
  shareUrl: string
  viewCount: number
  likeCount: number
  commentCount: number
  shareCount: number
}

/**
 * Fetch the user's videos from TikTok API and find the one matching the given videoId.
 * TikTok's API requires fetching the user's video list — you can't query by video ID directly.
 */
export async function getTikTokVideoMetrics(
  videoId: string,
  accessToken: string
): Promise<TikTokVideoMetrics & { ownerId: string }> {
  const fields = 'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count'
  const res = await fetch(`https://open.tiktokapis.com/v2/video/query/?fields=${fields}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters: {
        video_ids: [videoId],
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`TikTok API error (${res.status}): ${err}`)
  }

  const json = await res.json()
  const videos = json.data?.videos

  if (!videos || videos.length === 0) {
    throw new Error('Video not found. Make sure the video belongs to your linked TikTok account and is public.')
  }

  const v = videos[0]

  return {
    videoId: v.id,
    title: v.title || '',
    description: v.video_description || '',
    createTime: v.create_time,
    coverImageUrl: v.cover_image_url || '',
    shareUrl: v.share_url || '',
    viewCount: v.view_count ?? 0,
    likeCount: v.like_count ?? 0,
    commentCount: v.comment_count ?? 0,
    shareCount: v.share_count ?? 0,
    ownerId: '', // ownership is implicitly verified since we query with the user's token
  }
}
