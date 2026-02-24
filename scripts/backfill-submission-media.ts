import { config } from 'dotenv'
config({ path: '.env' })

import { PrismaClient } from '../app/generated/prisma/client'

const prisma = new PrismaClient()

const X_CLIENT_ID = process.env.AUTH_TWITTER_ID || ''
const X_CLIENT_SECRET = process.env.AUTH_TWITTER_SECRET || ''
const X_TWEET_URL = 'https://api.twitter.com/2/tweets'

const POST_URL_REGEX = /https?:\/\/(x\.com|twitter\.com)\/(\w+)\/status\/(\d+)/

function extractPostId(url: string): string | null {
  const match = url.match(POST_URL_REGEX)
  return match ? match[3] : null
}

async function refreshXToken(refreshToken: string) {
  const basicAuth = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json()
  return { accessToken: data.access_token as string, refreshToken: data.refresh_token as string, expiresIn: data.expires_in as number }
}

async function getValidToken(): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { xAccessToken: { not: null }, xRefreshToken: { not: null } },
    select: { id: true, xAccessToken: true, xRefreshToken: true, xTokenExpiresAt: true, xUsername: true },
    orderBy: { xTokenExpiresAt: 'desc' },
  })
  if (!user?.xAccessToken || !user?.xRefreshToken) throw new Error('No user with X tokens found')

  console.log(`Using X token from user: ${user.xUsername || user.id}`)

  if (user.xTokenExpiresAt && user.xTokenExpiresAt > new Date(Date.now() + 60_000)) {
    return user.xAccessToken
  }

  console.log('Token expired, refreshing...')
  const refreshed = await refreshXToken(user.xRefreshToken)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      xAccessToken: refreshed.accessToken,
      xRefreshToken: refreshed.refreshToken,
      xTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
    },
  })
  return refreshed.accessToken
}

interface PostMedia {
  type: string
  url?: string
  previewImageUrl?: string
  videoUrl?: string
}

async function fetchPostData(postId: string, accessToken: string) {
  const params = new URLSearchParams({
    'tweet.fields': 'public_metrics,text,author_id,attachments,created_at',
    'expansions': 'attachments.media_keys,author_id',
    'media.fields': 'url,preview_image_url,type,variants',
    'user.fields': 'name,username,profile_image_url',
  })

  const res = await fetch(`${X_TWEET_URL}/${postId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  console.log(`  [X API] status=${res.status}, remaining=${res.headers.get('x-rate-limit-remaining')}`)

  if (res.status === 429) {
    const resetEpoch = Number(res.headers.get('x-rate-limit-reset') || 0)
    const waitMs = resetEpoch ? (resetEpoch * 1000 - Date.now()) : 60_000
    console.log(`  Rate limited, waiting ${Math.ceil(waitMs / 1000)}s...`)
    await new Promise(r => setTimeout(r, waitMs + 1000))
    return fetchPostData(postId, accessToken)
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Tweet fetch failed (${res.status}): ${err}`)
  }

  const json = await res.json()
  const data = json.data
  const includes = json.includes

  const media: PostMedia[] = (includes?.media ?? []).map((m: any) => {
    let videoUrl: string | undefined
    if ((m.type === 'video' || m.type === 'animated_gif') && m.variants?.length) {
      const mp4s = m.variants
        .filter((v: any) => v.content_type === 'video/mp4')
        .sort((a: any, b: any) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))
      videoUrl = mp4s[0]?.url || m.variants[0]?.url
    }
    return {
      type: m.type,
      url: m.url || undefined,
      previewImageUrl: m.preview_image_url || undefined,
      videoUrl,
    }
  })

  const author = includes?.users?.[0]
  return {
    text: data.text,
    media,
    authorName: author?.name || null,
    authorUsername: author?.username || null,
    authorProfilePic: author?.profile_image_url || null,
    viewCount: data.public_metrics?.impression_count ?? 0,
    likeCount: data.public_metrics?.like_count ?? 0,
    retweetCount: data.public_metrics?.retweet_count ?? 0,
    commentCount: data.public_metrics?.reply_count ?? 0,
  }
}

async function main() {
  console.log('=== Backfill Submission Media Data ===\n')

  const allSubs = await prisma.submission.findMany({
    where: {
      bid: { task: { taskType: 'COMPETITION' } },
    },
    include: { bid: { select: { id: true, bidderId: true, task: { select: { id: true, title: true } } } } },
  })

  // Include entries missing text/media, OR entries with video media missing videoUrl
  const submissions = allSubs.filter(s => {
    if (!s.postText || !s.postMedia) return true
    const media = s.postMedia as any[]
    return media.some((m: any) => (m.type === 'video' || m.type === 'animated_gif') && !m.videoUrl)
  })

  console.log(`Found ${submissions.length} submissions needing backfill\n`)
  if (submissions.length === 0) {
    console.log('Nothing to do.')
    return
  }

  const accessToken = await getValidToken()
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const sub of submissions) {
    const postUrl = sub.postUrl || null
    const descUrl = sub.description ? sub.description.match(POST_URL_REGEX)?.[0] : null
    const url = postUrl || descUrl
    const postId = url ? extractPostId(url) : sub.xPostId

    console.log(`[${sub.id}] task="${sub.bid.task.title}", postId=${postId || 'none'}, url=${url || 'none'}`)

    if (!postId) {
      console.log('  SKIP: no post ID found')
      skipped++
      continue
    }

    try {
      const data = await fetchPostData(postId, accessToken)
      await prisma.submission.update({
        where: { id: sub.id },
        data: {
          postUrl: url || sub.postUrl,
          xPostId: postId,
          postText: data.text,
          postMedia: data.media as any,
          postAuthorName: data.authorName,
          postAuthorUsername: data.authorUsername,
          postAuthorProfilePic: data.authorProfilePic,
          viewCount: data.viewCount,
          likeCount: data.likeCount,
          retweetCount: data.retweetCount,
          commentCount: data.commentCount,
          metricsReadAt: new Date(),
        },
      })
      const hasVideo = data.media.some(m => m.videoUrl)
      console.log(`  OK: text=${data.text.length}ch, media=${data.media.length} (video=${hasVideo}), views=${data.viewCount}`)
      updated++
    } catch (err: any) {
      console.log(`  FAIL: ${err.message}`)
      failed++
    }

    // Small delay between requests to be nice to the API
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n=== Done === updated=${updated}, skipped=${skipped}, failed=${failed}`)
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
