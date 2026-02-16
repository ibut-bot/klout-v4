'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import Link from 'next/link'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''
const KLOUT_SCORE_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_KLOUT_SCORE_FEE_LAMPORTS || 10_000_000)

interface ScoreBreakdown {
  reach: { score: number; followers: number }
  engagement: { score: number; avgLikes: number; avgRetweets: number; avgReplies: number; avgViews: number; tweetsAnalyzed: number }
  ratio: { score: number; followers: number; following: number }
  verification: { score: number; type: string | null }
  geo: { multiplier: number; tier: number | null; tierLabel: string; location: string | null }
}

interface ScoreResult {
  id: string
  totalScore: number
  label: string
  breakdown: ScoreBreakdown
  qualityScore: number
  buffedImageUrl?: string | null
  tierQuote?: string | null
  xUsername?: string
  profileImageUrl?: string
  createdAt?: string
}

type Step = 'idle' | 'checking_x' | 'paying' | 'confirming' | 'calculating' | 'generating_image' | 'done' | 'error'

function AnimatedScore({ target }: { target: number }) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    const duration = 1500
    const start = performance.now()

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target * 10) / 10)
      if (progress < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }, [target])

  return <>{value}</>
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  // Proxy through our API to guarantee same-origin (avoids CORS canvas tainting)
  const proxied = `/api/proxy-image?url=${encodeURIComponent(src)}`
  const res = await fetch(proxied)
  if (!res.ok) throw new Error(`Image proxy failed: ${res.status}`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(objectUrl); reject(e) }
    img.src = objectUrl
  })
}

async function generateShareCard(score: ScoreResult): Promise<Blob | null> {
  const W = 1080
  const H = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Background
  ctx.fillStyle = '#09090b'
  ctx.fillRect(0, 0, W, H)

  // Draw buffed image
  if (score.buffedImageUrl) {
    try {
      const img = await loadImage(score.buffedImageUrl)
      const scale = Math.max(W / img.width, H / img.height)
      const sw = img.width * scale
      const sh = img.height * scale
      ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh)
    } catch {
      // If image fails to load, keep the dark background
    }
  }

  // Gradient overlay
  const grad = ctx.createLinearGradient(0, H * 0.35, 0, H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.6)')
  grad.addColorStop(1, 'rgba(0,0,0,0.92)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Score number
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 140px system-ui, -apple-system, sans-serif'
  ctx.textBaseline = 'bottom'
  ctx.fillText(String(score.totalScore), 60, H - 160)

  // Tier title
  ctx.fillStyle = '#eab308'
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif'
  ctx.fillText(score.label, 64, H - 115)

  // Quote
  if (score.tierQuote) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = 'italic 24px system-ui, -apple-system, sans-serif'
    const quote = `"${score.tierQuote}"`
    // Word-wrap the quote
    const maxW = W - 120
    const words = quote.split(' ')
    let line = ''
    let y = H - 60
    const lines: string[] = []
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > maxW) {
        lines.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) lines.push(line)
    // Draw from bottom up (max 2 lines)
    const display = lines.slice(0, 2)
    display.forEach((l, i) => {
      ctx.fillText(l, 60, y - (display.length - 1 - i) * 32)
    })
  }

  // Username
  if (score.xUsername) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '28px system-ui, -apple-system, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(`@${score.xUsername}`, 60, 40)
  }

  // Branding
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'right'
  ctx.fillText('klout.gg', W - 40, 40)

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

function BreakdownRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-k-border last:border-b-0">
      <div>
        <span className="text-sm font-medium text-zinc-300">{label}</span>
        {detail && <p className="text-xs text-zinc-500">{detail}</p>}
      </div>
      <span className="text-sm font-semibold text-accent">{value}</span>
    </div>
  )
}

export default function MyScorePage() {
  const { isAuthenticated, authFetch } = useAuth()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()

  const [xLinked, setXLinked] = useState<boolean | null>(null)
  const [xUsername, setXUsername] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [sharing, setSharing] = useState(false)

  const handleShare = useCallback(async () => {
    if (!scoreResult) return
    setSharing(true)
    try {
      const blob = await generateShareCard(scoreResult)
      if (!blob) return

      const tweetText = 'My Klout score just got #ENHANCED. Get yours at @kloutgg'

      // Copy image to clipboard so user can paste into the tweet
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ])
      } catch {
        // Fallback: download if clipboard write fails
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'klout-score.png'
        a.click()
        URL.revokeObjectURL(url)
      }

      // Open Twitter intent
      const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`
      window.open(twitterUrl, '_blank')
    } catch (err) {
      console.error('Share failed:', err)
    } finally {
      setSharing(false)
    }
  }, [scoreResult])

  // Check X link status
  useEffect(() => {
    if (!isAuthenticated) return
    authFetch('/api/auth/x/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setXLinked(data.linked)
          setXUsername(data.xUsername)
        }
      })
      .catch(() => {})
  }, [isAuthenticated, authFetch])

  // Load existing score
  useEffect(() => {
    if (!isAuthenticated) return
    setLoadingExisting(true)
    authFetch('/api/klout-score')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.score) {
          setScoreResult(data.score)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false))
  }, [isAuthenticated, authFetch])

  const handleCalculateScore = useCallback(async () => {
    if (!publicKey) return
    setError(null)
    setStep('paying')

    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(SYSTEM_WALLET),
          lamports: KLOUT_SCORE_FEE_LAMPORTS,
        })
      )

      const sig = await sendTransaction(tx, connection)
      setStep('confirming')

      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
      setStep('calculating')

      const res = await authFetch('/api/klout-score/calculate', {
        method: 'POST',
        body: JSON.stringify({ feeTxSig: sig }),
      })
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.message || 'Score calculation failed')
      }

      setScoreResult(data.score)
      setStep('done')
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong'
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setStep('idle')
        return
      }
      setError(msg)
      setStep('error')
    }
  }, [publicKey, connection, sendTransaction, authFetch])

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold text-white">My Klout Score</h1>
        <p className="text-zinc-500">Connect your wallet to view your score.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl pb-20">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white">
          My <span className="text-accent">Klout Score</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Measure your X influence with our scoring algorithm
        </p>
      </div>

      {/* X Link Status */}
      {xLinked === false && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center">
          <p className="text-sm text-amber-400 mb-3">
            You need to link your X account before calculating your score.
          </p>
          <Link
            href="/dashboard"
            className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover"
          >
            Link X Account
          </Link>
        </div>
      )}

      {/* Existing Score Display */}
      {scoreResult && (
        <div className="mb-6 rounded-2xl border border-k-border bg-surface overflow-hidden">
          {/* Hero: buffed image covering top half with score overlay */}
          <div className="relative w-full bg-zinc-900">
            {scoreResult.buffedImageUrl ? (
              <img
                src={scoreResult.buffedImageUrl}
                alt="Buffed profile"
                className="w-full object-contain"
              />
            ) : (
              <div className="w-full aspect-square bg-zinc-800" />
            )}
            {/* Gradient overlay for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

            {/* Score + tier overlaid on the image */}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-5xl font-black text-white leading-none">
                    <AnimatedScore target={scoreResult.totalScore} />
                  </p>
                  <p className="mt-1 text-sm font-semibold text-accent">{scoreResult.label}</p>
                  {scoreResult.xUsername && (
                    <a
                      href={`https://x.com/${scoreResult.xUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block text-xs text-zinc-400 hover:text-accent"
                    >
                      @{scoreResult.xUsername}
                    </a>
                  )}
                </div>
                {scoreResult.createdAt && (
                  <span className="text-[10px] text-zinc-500">
                    {new Date(scoreResult.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quote + breakdown below the image */}
          <div className="p-5">
            {/* Persisted tier quote */}
            {scoreResult.tierQuote && (
              <p className="mb-5 text-center text-sm italic text-zinc-400">
                &ldquo;{scoreResult.tierQuote}&rdquo;
              </p>
            )}

          {/* Breakdown */}
          <div className="rounded-xl border border-k-border bg-zinc-900/50 p-4">
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">Score Breakdown</h3>

            <BreakdownRow
              label="Reach"
              value={`${(scoreResult.breakdown.reach.score * 100).toFixed(0)}%`}
              detail={`${scoreResult.breakdown.reach.followers.toLocaleString()} followers`}
            />
            <BreakdownRow
              label="Engagement"
              value={`${(scoreResult.breakdown.engagement.score * 100).toFixed(0)}%`}
              detail={`avg ${scoreResult.breakdown.engagement.avgLikes.toFixed(1)} likes, ${scoreResult.breakdown.engagement.avgRetweets.toFixed(1)} RTs, ${scoreResult.breakdown.engagement.avgReplies.toFixed(1)} replies across ${scoreResult.breakdown.engagement.tweetsAnalyzed} tweets`}
            />
            <BreakdownRow
              label="Follower Ratio"
              value={`+${(scoreResult.breakdown.ratio.score * 100).toFixed(0)}%`}
              detail={`${scoreResult.breakdown.ratio.followers.toLocaleString()} followers / ${scoreResult.breakdown.ratio.following.toLocaleString()} following`}
            />
            <BreakdownRow
              label="Verification"
              value={`+${(scoreResult.breakdown.verification.score * 100).toFixed(0)}%`}
              detail={scoreResult.breakdown.verification.type || 'Not verified'}
            />
            <BreakdownRow
              label="Location"
              value={scoreResult.breakdown.geo.location || 'Planet Earth'}
            />

            <div className="mt-3 pt-3 border-t border-k-border flex justify-end">
              <span className="text-sm font-bold text-accent">{scoreResult.totalScore}/100</span>
            </div>
          </div>

          {/* Share Button */}
          <button
            onClick={handleShare}
            disabled={sharing}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
          >
            {sharing ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            )}
            {sharing ? 'Generating...' : 'Share on X (image copied to clipboard)'}
          </button>
          </div>
        </div>
      )}

      {/* Calculate / Recalculate Button */}
      {xLinked && (
        <div className="rounded-2xl border border-k-border bg-surface p-6 text-center">
          {step === 'idle' || step === 'done' || step === 'error' ? (
            <>
              {error && (
                <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <p className="text-sm text-zinc-400 mb-4">
                {scoreResult
                  ? 'Want to recalculate? Your score may have changed.'
                  : 'Calculate your Klout score based on your X profile and recent posts.'}
              </p>

              <button
                onClick={handleCalculateScore}
                disabled={!publicKey}
                className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-black transition hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scoreResult ? 'Recalculate Score' : 'Get My Score'} — 0.01 SOL
              </button>
              <p className="mt-2 text-xs text-zinc-600">
                Fee covers X API costs. Score is computed from your profile metrics and last 20 tweets.
              </p>
            </>
          ) : (
            <div className="py-4">
              <div className="mb-4 flex justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
              <p className="text-sm font-medium text-white">
                {step === 'paying' && 'Approve the transaction in your wallet...'}
                {step === 'confirming' && 'Confirming payment on Solana...'}
                {step === 'calculating' && 'Reading your X profile & tweets and computing score...'}
                {step === 'generating_image' && 'Generating your buffed profile image...'}
                {step === 'checking_x' && 'Checking X account...'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">This may take a few seconds</p>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loadingExisting && !scoreResult && (
        <div className="rounded-2xl border border-k-border bg-surface p-8">
          <div className="flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        </div>
      )}
    </div>
  )
}
