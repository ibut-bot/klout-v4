'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'

const TIP_AMOUNT_LAMPORTS = 10_000_000
const TIP_AMOUNT_SOL = TIP_AMOUNT_LAMPORTS / LAMPORTS_PER_SOL

interface PostMedia {
  type: string
  url?: string
  previewImageUrl?: string
  videoUrl?: string
}

interface FeedItem {
  id: string
  postUrl: string | null
  xPostId: string | null
  postText: string | null
  postMedia: PostMedia[]
  authorName: string | null
  authorUsername: string | null
  authorProfilePic: string | null
  viewCount: number
  likeCount: number
  retweetCount: number
  commentCount: number
  createdAt: string
  winnerPlace: number | null
  recipientWallet: string
  tipCount: number
  tipTotalLamports: string
  competition: {
    id: string
    title: string
    imageUrl: string | null
  }
}

const proxyVideo = (vUrl: string) => `/api/video-proxy?url=${encodeURIComponent(vUrl)}`

function FeedCard({ item, isVisible, globalMuted, onUnmute, onTip, tipping }: {
  item: FeedItem
  isVisible: boolean
  globalMuted: boolean
  onUnmute: () => void
  onTip: (item: FeedItem) => void
  tipping: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [localTipCount, setLocalTipCount] = useState(item.tipCount)
  const [localTipTotal, setLocalTipTotal] = useState(Number(item.tipTotalLamports))
  const [showTipAnim, setShowTipAnim] = useState(false)

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    vid.muted = globalMuted
    if (isVisible) {
      vid.play().catch(() => {})
    } else {
      vid.pause()
    }
  }, [isVisible, globalMuted])

  const media = item.postMedia?.[0]
  const isVideo = media && (media.type === 'video' || media.type === 'animated_gif')
  const videoSrc = isVideo && media.videoUrl ? proxyVideo(media.videoUrl) : null
  const imgSrc = media?.url || media?.previewImageUrl

  const handleVideoClick = () => onUnmute()

  const handleTip = () => {
    onTip(item)
    setLocalTipCount(c => c + 1)
    setLocalTipTotal(t => t + TIP_AMOUNT_LAMPORTS)
    setShowTipAnim(true)
    setTimeout(() => setShowTipAnim(false), 800)
  }

  const postTextClean = item.postText?.replace(/https:\/\/t\.co\/\w+/g, '').trim()

  return (
    <div className="relative h-[calc(100vh-56px)] w-full snap-start overflow-hidden bg-black">
      {/* Media — cover on mobile, contain on desktop */}
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          poster={media?.previewImageUrl}
          loop
          muted={globalMuted}
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover sm:object-contain"
          onClick={handleVideoClick}
        />
      ) : imgSrc ? (
        <img src={imgSrc} alt="" className="absolute inset-0 h-full w-full object-cover sm:object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-zinc-600">No media</div>
      )}

      {/* Mute indicator */}
      {videoSrc && (
        <button
          onClick={handleVideoClick}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm text-white transition hover:bg-black/70 sm:right-4 sm:top-4 sm:h-9 sm:w-9"
        >
          {globalMuted ? (
            <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>
      )}

      {/* Right side actions */}
      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-4 sm:right-4">
        <button
          onClick={handleTip}
          disabled={tipping}
          className="group flex flex-col items-center gap-1 disabled:opacity-50"
        >
          <div className={`relative flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition group-hover:bg-yellow-500/30 sm:h-12 sm:w-12 ${showTipAnim ? 'scale-125' : ''}`} style={{ transition: 'transform 0.2s' }}>
            <svg className={`h-6 w-6 transition ${showTipAnim ? 'text-yellow-400' : 'text-white'} sm:h-7 sm:w-7`} viewBox="0 0 24 24" fill="none">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" />
              <text x="12" y="13" textAnchor="middle" fontSize="9" fontWeight="bold" fill={showTipAnim ? '#000' : '#000'} fontFamily="sans-serif">$</text>
            </svg>
            {showTipAnim && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 animate-bounce text-xs font-bold text-yellow-400">
                +{TIP_AMOUNT_SOL}
              </span>
            )}
          </div>
          <span className="text-[11px] font-semibold text-white drop-shadow sm:text-xs">
            {localTipCount > 0 ? localTipCount : 'Tip'}
          </span>
        </button>

        {localTipTotal > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-bold text-yellow-400 drop-shadow sm:text-xs">
              {(localTipTotal / LAMPORTS_PER_SOL).toFixed(2)}
            </span>
            <span className="text-[9px] text-zinc-400 sm:text-[10px]">SOL</span>
          </div>
        )}
      </div>

      {/* Bottom overlay */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-4 pt-16 sm:px-4 sm:pb-6 sm:pt-20">
        {/* Author */}
        <div className="mb-2 flex items-center gap-2 sm:mb-3 sm:gap-3">
          {item.authorProfilePic ? (
            <img src={item.authorProfilePic} alt="" className="h-8 w-8 shrink-0 rounded-full border-2 border-white/20 object-cover sm:h-10 sm:w-10" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-zinc-800 text-xs font-bold text-zinc-400 sm:h-10 sm:w-10 sm:text-sm">
              {(item.authorUsername || '??').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white sm:text-sm">
              {item.authorName || item.authorUsername || 'Anonymous'}
            </p>
            {item.authorUsername && (
              <p className="truncate text-[11px] text-zinc-400 sm:text-xs">@{item.authorUsername}</p>
            )}
          </div>
          {item.winnerPlace && (
            <span className="shrink-0 rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-400 sm:px-2.5 sm:py-1 sm:text-xs">
              {item.winnerPlace <= 3
                ? ['1st', '2nd', '3rd'][item.winnerPlace - 1]
                : `${item.winnerPlace}th`} Place
            </span>
          )}
        </div>

        {/* Post text */}
        {postTextClean && (
          <p className="mb-2 line-clamp-2 text-xs leading-snug text-zinc-200 sm:mb-3 sm:line-clamp-3 sm:text-sm sm:leading-relaxed">
            {postTextClean}
          </p>
        )}

        {/* Competition tag */}
        <div className="mb-1.5 sm:mb-0">
          <Link
            href={`/tasks/${item.competition.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-300 backdrop-blur-sm transition hover:bg-white/20 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs"
          >
            <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            <span className="max-w-[120px] truncate sm:max-w-[180px]">{item.competition.title}</span>
          </Link>
        </div>

        {/* Metrics row */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-400 sm:gap-4 sm:text-xs">
          {item.viewCount > 0 && (
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {item.viewCount.toLocaleString()}
            </span>
          )}
          {item.likeCount > 0 && (
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              {item.likeCount.toLocaleString()}
            </span>
          )}
          {item.retweetCount > 0 && (
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {item.retweetCount.toLocaleString()}
            </span>
          )}
          {item.postUrl && (
            <a
              href={item.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-zinc-400 transition hover:text-white"
            >
              <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [visibleId, setVisibleId] = useState<string | null>(null)
  const [globalMuted, setGlobalMuted] = useState(true)
  const [tippingId, setTippingId] = useState<string | null>(null)
  const [pendingTipItem, setPendingTipItem] = useState<FeedItem | null>(null)

  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const { authFetch, isAuthenticated } = useAuth()
  const { setVisible: openWalletModal } = useWalletModal()

  const executeTip = useCallback(async (item: FeedItem) => {
    if (!publicKey) return
    setTippingId(item.id)

    try {
      const recipientPubkey = new PublicKey(item.recipientWallet)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipientPubkey,
          lamports: TIP_AMOUNT_LAMPORTS,
        })
      )
      const signature = await sendTransaction(tx, connection)
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

      await authFetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: item.id, txSignature: signature }),
      })
    } catch (err: any) {
      if (err?.message?.includes('User rejected')) {
        // user cancelled — no-op
      } else {
        console.error('Tip failed:', err)
      }
    } finally {
      setTippingId(null)
    }
  }, [publicKey, connection, sendTransaction, authFetch])

  // When wallet connects and there's a pending tip, execute it
  useEffect(() => {
    if (publicKey && isAuthenticated && pendingTipItem && !tippingId) {
      const item = pendingTipItem
      setPendingTipItem(null)
      executeTip(item)
    }
  }, [publicKey, isAuthenticated, pendingTipItem, tippingId, executeTip])

  const handleTip = useCallback((item: FeedItem) => {
    if (!publicKey || !isAuthenticated) {
      setPendingTipItem(item)
      openWalletModal(true)
      return
    }
    if (tippingId) return
    executeTip(item)
  }, [publicKey, isAuthenticated, tippingId, openWalletModal, executeTip])
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const fetchFeed = useCallback(async (cursor?: string) => {
    try {
      const params = new URLSearchParams({ limit: '10' })
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/feed?${params}`)
      const data = await res.json()
      if (data.success) {
        setItems(prev => cursor ? [...prev, ...data.feed] : data.feed)
        setNextCursor(data.nextCursor)
        setHasMore(data.hasMore)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFeed()
  }, [fetchFeed])

  // Intersection observer for autoplay/pause
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleId(entry.target.getAttribute('data-feed-id'))
          }
        }
      },
      { threshold: 0.6 }
    )

    const refs = cardRefs.current
    refs.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  // Infinite scroll sentinel
  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && hasMore) {
          fetchFeed(nextCursor)
        }
      },
      { rootMargin: '400px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [nextCursor, hasMore, fetchFeed])

  if (loading && items.length === 0) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          <span className="text-sm text-zinc-500">Loading feed...</span>
        </div>
      </div>
    )
  }

  if (!loading && items.length === 0) {
    return (
      <div className="flex h-[calc(100vh-56px)] flex-col items-center justify-center bg-black px-4 text-center">
        <svg className="mb-4 h-16 w-16 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <h2 className="mb-2 text-lg font-semibold text-zinc-300">No posts yet</h2>
        <p className="text-sm text-zinc-500">
          Competition entries will appear here when creators enable the public feed.
        </p>
        <Link
          href="/tasks"
          className="mt-6 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-black transition hover:bg-accent/90"
        >
          Browse Competitions
        </Link>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-56px)] snap-y snap-mandatory overflow-y-auto bg-black"
    >
      {items.map((item) => (
        <div
          key={item.id}
          data-feed-id={item.id}
          ref={(el) => {
            if (el) cardRefs.current.set(item.id, el)
            else cardRefs.current.delete(item.id)
          }}
        >
          <FeedCard
            item={item}
            isVisible={visibleId === item.id}
            globalMuted={globalMuted}
            onUnmute={() => setGlobalMuted(m => !m)}
            onTip={handleTip}
            tipping={tippingId === item.id}
          />
        </div>
      ))}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" />

      {loading && items.length > 0 && (
        <div className="flex h-20 items-center justify-center bg-black">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
        </div>
      )}
    </div>
  )
}
