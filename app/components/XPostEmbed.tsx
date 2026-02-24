'use client'

import { useEffect, useRef, useState } from 'react'

const X_POST_REGEX = /https?:\/\/(x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)/

declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (el?: HTMLElement) => void
        createTweet: (id: string, el: HTMLElement, options?: Record<string, string>) => Promise<HTMLElement>
      }
    }
  }
}

function loadWidgetsScript(): Promise<void> {
  if (window.twttr) return Promise.resolve()
  return new Promise((resolve) => {
    if (document.getElementById('twitter-wjs')) {
      const check = setInterval(() => {
        if (window.twttr) { clearInterval(check); resolve() }
      }, 100)
      return
    }
    const script = document.createElement('script')
    script.id = 'twitter-wjs'
    script.src = 'https://platform.twitter.com/widgets.js'
    script.async = true
    script.onload = () => {
      const check = setInterval(() => {
        if (window.twttr) { clearInterval(check); resolve() }
      }, 100)
    }
    document.head.appendChild(script)
  })
}

export function extractXPostUrl(text: string): string | null {
  const match = text.match(X_POST_REGEX)
  return match ? match[0] : null
}

export function extractTweetId(url: string): string | null {
  const match = url.match(X_POST_REGEX)
  return match ? match[3] : null
}

interface XPostEmbedProps {
  url: string
  className?: string
}

export default function XPostEmbed({ url, className = '' }: XPostEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const tweetId = extractTweetId(url)

  useEffect(() => {
    if (!tweetId || !containerRef.current) return
    let cancelled = false

    setLoaded(false)
    setFailed(false)

    loadWidgetsScript().then(() => {
      if (cancelled || !containerRef.current || !window.twttr) return
      containerRef.current.innerHTML = ''
      window.twttr.widgets
        .createTweet(tweetId, containerRef.current, { theme: 'dark', dnt: 'true', align: 'center' })
        .then((el) => {
          if (cancelled) return
          if (el) setLoaded(true)
          else setFailed(true)
        })
        .catch(() => { if (!cancelled) setFailed(true) })
    })

    return () => { cancelled = true }
  }, [tweetId])

  if (!tweetId) return null

  return (
    <div className={className}>
      {!loaded && !failed && (
        <div className="flex items-center gap-2 rounded-lg border border-k-border bg-surface p-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
          <span className="text-xs text-zinc-500">Loading post preview...</span>
        </div>
      )}
      {failed && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-k-border bg-surface p-4 hover:bg-surface-hover transition-colors"
        >
          <svg className="h-5 w-5 text-zinc-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span className="text-sm text-accent underline">View post on X</span>
        </a>
      )}
      <div ref={containerRef} style={loaded ? undefined : { position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
    </div>
  )
}
