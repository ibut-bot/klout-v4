'use client'

import { useEffect, useState } from 'react'

const X_POST_REGEX = /https?:\/\/(x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)(\?\S+)?/

export function extractXPostUrl(text: string): string | null {
  const match = text.match(X_POST_REGEX)
  return match ? match[0] : null
}

export function extractTweetId(url: string): string | null {
  const match = url.match(X_POST_REGEX)
  return match ? match[3] : null
}

interface PostMedia {
  type: string
  url?: string
  previewImageUrl?: string
  videoUrl?: string
}

interface XPostEmbedProps {
  url: string
  className?: string
  postText?: string | null
  postMedia?: PostMedia[] | null
  authorName?: string | null
  authorUsername?: string | null
  authorProfilePic?: string | null
}

export default function XPostEmbed({
  url,
  className = '',
  postText,
  postMedia,
  authorName,
  authorUsername,
  authorProfilePic,
}: XPostEmbedProps) {
  const [oembedHtml, setOembedHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [videoError, setVideoError] = useState<Record<number, boolean>>({})
  const tweetId = extractTweetId(url)
  const fallbackUsername = url.match(X_POST_REGEX)?.[2]
  const displayUsername = authorUsername || fallbackUsername
  const hasRichData = !!(postText || (postMedia && postMedia.length > 0))

  // Fetch oEmbed only if we don't have rich data stored
  useEffect(() => {
    if (hasRichData || !tweetId) return
    let cancelled = false
    setLoading(true)

    fetch(`/api/oembed?url=${encodeURIComponent(url)}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        if (!cancelled && data.html) setOembedHtml(data.html)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [url, tweetId, hasRichData])

  if (!tweetId) return null

  const proxyVideo = (vUrl: string) => `/api/video-proxy?url=${encodeURIComponent(vUrl)}`
  const mediaItems = postMedia?.filter(m => m.url || m.videoUrl || m.previewImageUrl) ?? []

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border border-zinc-700/80 bg-black">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            {authorProfilePic ? (
              <img src={authorProfilePic} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-zinc-400">
                {(displayUsername || '??').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              {authorName && <p className="text-sm font-bold text-zinc-100">{authorName}</p>}
              <p className="text-sm text-zinc-500">@{displayUsername}</p>
            </div>
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>

        {/* Body */}
        <div className="px-4 pb-3">
          {hasRichData ? (
            <>
              {postText && (
                <p className="mb-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-200">
                  {postText.replace(/https:\/\/t\.co\/\w+/g, '').trim()}
                </p>
              )}
              {mediaItems.length > 0 && (
                <div className={`mb-3 overflow-hidden rounded-xl border border-zinc-800 ${mediaItems.length > 1 && !mediaItems.some(m => m.videoUrl) ? 'grid grid-cols-2 gap-0.5' : ''}`}>
                  {mediaItems.map((m, i) => {
                    const isVideo = m.type === 'video' || m.type === 'animated_gif'
                    const canPlay = isVideo && m.videoUrl && !videoError[i]

                    if (canPlay) {
                      return (
                        <video
                          key={i}
                          src={proxyVideo(m.videoUrl!)}
                          poster={m.previewImageUrl}
                          controls
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="auto"
                          className="w-full bg-black"
                          onError={() => setVideoError(prev => ({ ...prev, [i]: true }))}
                        />
                      )
                    }

                    const imgSrc = m.url || m.previewImageUrl
                    if (!imgSrc) return null

                    if (isVideo) {
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="relative block">
                          <img src={imgSrc} alt="" className="w-full" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                              <svg className="h-7 w-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            </div>
                          </div>
                        </a>
                      )
                    }

                    return <img key={i} src={imgSrc} alt="" className="w-full" />
                  })}
                </div>
              )}
            </>
          ) : oembedHtml ? (
            <div
              className="oembed-content text-[15px] leading-relaxed text-zinc-200 [&_a]:text-accent [&_a]:no-underline [&_a:hover]:underline"
              dangerouslySetInnerHTML={{
                __html: oembedHtml
                  .replace(/<blockquote[^>]*>/, '<div>')
                  .replace(/<\/blockquote>/, '</div>')
                  .replace(/<script[^>]*><\/script>/, '')
              }}
            />
          ) : loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
              <span className="text-xs text-zinc-500">Loading post...</span>
            </div>
          ) : (
            <p className="py-2 text-sm text-zinc-500">
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                View post on X ↗
              </a>
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-4 py-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Open on X ↗
          </a>
        </div>
      </div>
    </div>
  )
}
