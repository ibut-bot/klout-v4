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
  xUsername?: string
  profileImageUrl?: string
  createdAt?: string
}

type Step = 'idle' | 'checking_x' | 'paying' | 'confirming' | 'calculating' | 'done' | 'error'

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const circumference = 2 * Math.PI * 58
  const filled = (score / 100) * circumference

  const color =
    score >= 80 ? '#22c55e' :
    score >= 60 ? '#3b82f6' :
    score >= 40 ? '#eab308' :
    score >= 20 ? '#f97316' :
    '#ef4444'

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
        <circle cx="70" cy="70" r="58" fill="none" stroke="#27272a" strokeWidth="10" />
        <circle
          cx="70" cy="70" r="58"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: 140, height: 140 }}>
        <span className="text-3xl font-bold text-white">{score}</span>
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
    </div>
  )
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
      // 1. Send SOL payment
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

      // 2. Call the scoring API
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
      // Don't show wallet rejection as an error
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
        <div className="mb-6 rounded-2xl border border-k-border bg-surface p-6">
          {/* Score Gauge */}
          <div className="relative flex justify-center mb-6">
            <ScoreGauge score={scoreResult.totalScore} label={scoreResult.label} />
          </div>

          {/* User info */}
          {scoreResult.xUsername && (
            <p className="text-center text-sm text-zinc-400 mb-4">
              <a
                href={`https://x.com/${scoreResult.xUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-hover"
              >
                @{scoreResult.xUsername}
              </a>
              {scoreResult.createdAt && (
                <span className="text-zinc-600 ml-2">
                  scored {new Date(scoreResult.createdAt).toLocaleDateString()}
                </span>
              )}
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
              label="Geographic"
              value={`${scoreResult.breakdown.geo.multiplier}x`}
              detail={`${scoreResult.breakdown.geo.tierLabel}${scoreResult.breakdown.geo.location ? ` — ${scoreResult.breakdown.geo.location}` : ''}`}
            />

            <div className="mt-3 pt-3 border-t border-k-border flex justify-between">
              <span className="text-sm text-zinc-400">
                Quality: {(scoreResult.qualityScore * 100).toFixed(1)}% × Geo: {scoreResult.breakdown.geo.multiplier}x
              </span>
              <span className="text-sm font-bold text-accent">{scoreResult.totalScore}/100</span>
            </div>
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
