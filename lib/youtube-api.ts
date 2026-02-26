const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || ''
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

/** Extract YouTube video ID from various URL formats */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export interface YouTubeVideoMetrics {
  videoId: string
  title: string
  description: string
  channelId: string
  channelTitle: string
  publishedAt: string
  viewCount: number
  likeCount: number
  commentCount: number
  duration: string
  thumbnailUrl: string
}

/** Fetch video metrics from YouTube Data API v3 */
export async function getYouTubeVideoMetrics(videoId: string): Promise<YouTubeVideoMetrics> {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY is not configured')
  }

  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: videoId,
    key: YOUTUBE_API_KEY,
  })

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params.toString()}`)

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`YouTube API error (${res.status}): ${err}`)
  }

  const json = await res.json()

  if (!json.items || json.items.length === 0) {
    throw new Error('Video not found or is private')
  }

  const item = json.items[0]
  const snippet = item.snippet
  const stats = item.statistics
  const content = item.contentDetails

  return {
    videoId: item.id,
    title: snippet.title,
    description: snippet.description,
    channelId: snippet.channelId,
    channelTitle: snippet.channelTitle,
    publishedAt: snippet.publishedAt,
    viewCount: parseInt(stats.viewCount || '0', 10),
    likeCount: parseInt(stats.likeCount || '0', 10),
    commentCount: parseInt(stats.commentCount || '0', 10),
    duration: content.duration,
    thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
  }
}

