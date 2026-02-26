'use client'

import { useState, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { type PaymentTokenType, type TokenInfo, formatTokenAmount, resolveTokenInfo } from '@/lib/token-utils'
import { getKloutAdjustedFee } from '@/lib/klout-fee'
import { getKloutCpmMultiplier } from '@/lib/klout-cpm'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''

interface Props {
  taskId: string
  guidelines: { dos: string[]; donts: string[] }
  cpmLamports: string
  budgetLamports: string
  budgetRemainingLamports: string
  minPayoutLamports?: string
  minViews?: number
  minLikes?: number
  minRetweets?: number
  minComments?: number
  maxBudgetPerUserPercent?: number
  maxBudgetPerPostPercent?: number
  minKloutScore?: number | null
  requireFollowX?: string | null
  collateralLink?: string | null
  platform?: 'X' | 'YOUTUBE'
  kloutScore: number
  xLinked: boolean
  youtubeLinked?: boolean
  hasKloutScore: boolean
  onSubmitted: () => void
  paymentToken?: PaymentTokenType
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
}

export default function CampaignSubmitForm({ taskId, guidelines, cpmLamports, budgetLamports, budgetRemainingLamports, minPayoutLamports, minViews, minLikes, minRetweets, minComments, maxBudgetPerUserPercent, maxBudgetPerPostPercent, minKloutScore, requireFollowX, collateralLink, platform = 'X', kloutScore, xLinked, youtubeLinked, hasKloutScore, onSubmitted, paymentToken = 'SOL', customTokenMint, customTokenSymbol, customTokenDecimals }: Props) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()

  const [postUrl, setPostUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'paying' | 'verifying' | 'done'>('form')
  const [result, setResult] = useState<{
    success: boolean
    viewCount?: number
    payoutLamports?: string
    explanation?: string
    error?: string
    resubmittable?: boolean
  } | null>(null)

  const [priorSubmissionCount, setPriorSubmissionCount] = useState(0)
  const [capReached, setCapReached] = useState(false)
  const [myTotalEarned, setMyTotalEarned] = useState(0)
  const [myBudgetCap, setMyBudgetCap] = useState(0)

  const fetchPriorCount = async () => {
    try {
      const res = await authFetch(`/api/tasks/${taskId}/campaign-submissions?limit=1`)
      const data = await res.json()
      if (data.success) setPriorSubmissionCount(data.pagination.total)
    } catch {}
  }

  const fetchCapStatus = async () => {
    try {
      const res = await authFetch(`/api/tasks/${taskId}/campaign-stats`)
      const data = await res.json()
      if (data.success && data.stats) {
        const earned = Number(data.stats.myTotalEarnedLamports || '0')
        const cap = Number(data.stats.myBudgetCapLamports || '0')
        setMyTotalEarned(earned)
        setMyBudgetCap(cap)
        setCapReached(cap > 0 && earned >= cap)
      }
    } catch {}
  }

  useEffect(() => { fetchPriorCount(); fetchCapStatus() }, [taskId])

  const followKey = requireFollowX ? `follow_${taskId}_${requireFollowX}` : ''
  const [hasFollowed, setHasFollowed] = useState(false)

  useEffect(() => {
    if (followKey && typeof window !== 'undefined') {
      setHasFollowed(localStorage.getItem(followKey) === '1')
    }
  }, [followKey])

  const handleFollowClick = () => {
    if (requireFollowX) {
      window.open(`https://x.com/intent/follow?screen_name=${requireFollowX}`, '_blank')
      localStorage.setItem(followKey, '1')
      setHasFollowed(true)
    }
  }

  const budgetExhausted = BigInt(budgetRemainingLamports) <= BigInt(0)
  const formDisabled = budgetExhausted || capReached

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!publicKey || !xLinked || formDisabled) return
    setError('')
    setResult(null)
    setLoading(true)

    try {
      // Pre-flight: re-check budget from server before charging the SOL fee
      setStep('verifying')
      const preCheck = await fetch(`/api/tasks/${taskId}`)
      const preData = await preCheck.json()
      if (preData.success && preData.task?.campaignConfig) {
        const freshRemaining = BigInt(preData.task.campaignConfig.budgetRemainingLamports || '0')
        if (freshRemaining <= BigInt(0)) {
          setError('Campaign budget has been fully allocated. Please refresh the page.')
          setStep('form')
          setLoading(false)
          return
        }
      }

      // Step 1: Pay API fee (adjusted by Klout score + repeat submission surcharge)
      setStep('paying')
      const feeLamports = getKloutAdjustedFee(kloutScore, priorSubmissionCount)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(SYSTEM_WALLET),
          lamports: feeLamports,
        })
      )
      const sig = await sendTransaction(tx, connection)
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')

      // Step 2: Submit to backend
      setStep('verifying')
      const res = await authFetch(`/api/tasks/${taskId}/campaign-submit`, {
        method: 'POST',
        body: JSON.stringify({ postUrl, apiFeeTxSig: sig }),
      })

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error('Server error – please try again in a moment')
      }
      const data = await res.json()

      if (data.success) {
        setStep('done')
        setResult({
          success: true,
          viewCount: data.submission.viewCount,
          payoutLamports: data.submission.payoutLamports,
        })
        setPostUrl('')
        setPriorSubmissionCount(c => c + 1)
        fetchCapStatus()
        onSubmitted()
      } else {
        setResult({
          success: false,
          error: data.message,
          explanation: data.explanation,
          viewCount: data.viewCount,
          resubmittable: data.resubmittable,
        })
        setStep('form')
      }
    } catch (e: any) {
      setError(e.message || 'Submission failed')
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  const feeSol = (getKloutAdjustedFee(kloutScore, priorSubmissionCount) / LAMPORTS_PER_SOL).toFixed(4)
  const tInfo = resolveTokenInfo(paymentToken, customTokenMint, customTokenSymbol, customTokenDecimals)
  const sym = tInfo.symbol
  const cpmDisplay = formatTokenAmount(cpmLamports, tInfo, 2)
  const cpmMultiplier = getKloutCpmMultiplier(kloutScore)
  const effectiveCpmLamports = Math.floor(Number(cpmLamports) * cpmMultiplier).toString()
  const effectiveCpmDisplay = formatTokenAmount(effectiveCpmLamports, tInfo, 2)
  const topUserPercent = maxBudgetPerUserPercent ?? 10
  const userMaxPercent = topUserPercent * cpmMultiplier
  const userMaxLamports = Math.floor(Number(budgetLamports) * (userMaxPercent / 100))
  const userMaxDisplay = formatTokenAmount(userMaxLamports, tInfo, 2)
  const remainingDisplay = formatTokenAmount(budgetRemainingLamports, tInfo, 2)
  const minPayoutDisplay = minPayoutLamports && Number(minPayoutLamports) > 0
    ? formatTokenAmount(minPayoutLamports, tInfo, 2)
    : null

  const isYouTube = platform === 'YOUTUBE'
  const accountLinked = isYouTube ? youtubeLinked : xLinked

  if (!accountLinked) {
    return (
      <div className="rounded-xl border border-amber-800 bg-amber-500/10 p-4">
        <p className="text-sm text-amber-300">
          {isYouTube
            ? 'You need to link your YouTube channel before submitting to YouTube campaigns. Go to the profile dropdown and click "Link YouTube Channel".'
            : 'You need to link your X account before submitting to campaigns. Go to the profile dropdown and click "Link X Account".'}
        </p>
      </div>
    )
  }

  if (!hasKloutScore) {
    return (
      <div className="rounded-xl border border-amber-800 bg-amber-500/10 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <svg className="h-5 w-5 mt-0.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-amber-300">Klout Score Required</p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              You need a Klout score to submit to campaigns. Your score measures your X/Twitter influence and unlocks access to <span className="text-zinc-200">exclusive, higher-paying campaigns</span>.
            </p>
          </div>
        </div>
        <a
          href="/my-score"
          className="inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-black hover:bg-accent-hover transition-colors"
        >
          Get Your Klout Score
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Campaign Info Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
          <p className="text-[11px] text-zinc-500">Your CPM (per 1,000 views)</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{effectiveCpmDisplay} {sym}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            Based on your Klout Score{cpmMultiplier < 1 && <> &middot; <a href="/my-score" className="text-accent hover:underline">boost your score</a></>}
          </p>
        </div>
        <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
          <p className="text-[11px] text-zinc-500">Budget remaining</p>
          <p className={`mt-1 text-sm font-semibold ${budgetExhausted ? 'text-red-500' : 'text-zinc-100'}`}>{remainingDisplay} {sym}</p>
        </div>
        <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
          <p className="text-[11px] text-zinc-500">Verification fee</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{feeSol} SOL</p>
          {priorSubmissionCount > 0 && (
            <p className="mt-0.5 text-[10px] text-zinc-500">
              +{Math.round((Math.pow(1.2, priorSubmissionCount) - 1) * 100)}% repeat surcharge
            </p>
          )}
        </div>
        {minViews !== undefined && minViews > 0 && (
          <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
            <p className="text-[11px] text-zinc-500">Min views per post</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{minViews.toLocaleString()}</p>
          </div>
        )}
        {minLikes !== undefined && minLikes > 0 && (
          <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
            <p className="text-[11px] text-zinc-500">Min likes per post</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{minLikes.toLocaleString()}</p>
          </div>
        )}
        {minRetweets !== undefined && minRetweets > 0 && (
          <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
            <p className="text-[11px] text-zinc-500">Min retweets per post</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{minRetweets.toLocaleString()}</p>
          </div>
        )}
        {minComments !== undefined && minComments > 0 && (
          <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
            <p className="text-[11px] text-zinc-500">Min comments per post</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{minComments.toLocaleString()}</p>
          </div>
        )}
        {minPayoutDisplay && (
          <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
            <p className="text-[11px] text-zinc-500">Min payout threshold</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{minPayoutDisplay} {sym}</p>
          </div>
        )}
        <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
          <p className="text-[11px] text-zinc-500">Your max earning</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{userMaxDisplay} {sym}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">Based on your Klout Score</p>
        </div>
        {maxBudgetPerPostPercent != null && (
          <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
            <p className="text-[11px] text-zinc-500">Max per post</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{maxBudgetPerPostPercent}% of budget</p>
          </div>
        )}
        {minKloutScore != null && (
          <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
            <p className="text-[11px] text-zinc-500">Min Klout score</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{minKloutScore.toLocaleString()}</p>
          </div>
        )}
        <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
          <p className="text-[11px] text-zinc-500">Your Klout Score</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{Math.round(kloutScore).toLocaleString()}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            <a href="/my-score" className="text-accent hover:underline">View details</a>
          </p>
        </div>
      </div>

      {/* Follow requirement */}
      {requireFollowX && !hasFollowed && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-200">Follow <span className="text-accent">@{requireFollowX}</span> on X</p>
            <p className="text-xs text-zinc-500 mt-0.5">The campaign creator requires participants to follow their X account.</p>
          </div>
          <button
            type="button"
            onClick={handleFollowClick}
            className="flex-shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover transition-colors"
          >
            Follow
          </button>
        </div>
      )}

      {/* Guidelines */}
      {(guidelines.dos.length > 0 || guidelines.donts.length > 0) && (
        <div className="space-y-2 rounded-xl border border-k-border p-4 text-xs">
          {guidelines.dos.length > 0 && (
            <div>
              <p className="font-medium text-green-400">Do&apos;s:</p>
              <ul className="ml-4 list-disc text-zinc-400">
                {guidelines.dos.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
          {guidelines.donts.length > 0 && (
            <div>
              <p className="font-medium text-red-400">Don&apos;ts:</p>
              <ul className="ml-4 list-disc text-zinc-400">
                {guidelines.donts.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Collateral Link */}
      {collateralLink && (
        <div className="rounded-xl border border-k-border p-4">
          <p className="text-xs font-medium text-zinc-400 mb-1">Campaign Collateral</p>
          <a
            href={collateralLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover underline underline-offset-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            View collateral (images, logos, assets)
          </a>
          <p className="mt-1 text-[11px] text-zinc-600">Provided by the campaign owner for guidance. Use of these materials is optional.</p>
        </div>
      )}

      {/* Submit Your Post */}
      <div className="rounded-xl border border-k-border p-4">
        {budgetExhausted ? (
          <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
            Campaign budget has been exhausted. No more submissions accepted.
          </div>
        ) : capReached ? (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm space-y-1">
            <p className="font-medium text-amber-400">You&apos;ve reached your earning cap for this campaign</p>
            <p className="text-xs text-zinc-400">You&apos;ve earned {formatTokenAmount(myTotalEarned, tInfo, 2)} of your {formatTokenAmount(myBudgetCap, tInfo, 2)} {sym} limit. Increase your Klout score to unlock a higher cap.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Submit Your Post</h3>
            <div>
              <input
                type="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder={isYouTube ? 'https://youtube.com/watch?v=...' : 'https://x.com/yourhandle/status/...'}
                required
                disabled={loading}
                className="w-full rounded-lg border border-zinc-600 bg-surface px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 p-2 text-xs text-red-400">{error}</div>
            )}

            {result && !result.success && (
              <div className="rounded-lg bg-red-500/10 p-3 text-xs">
                <p className="font-medium text-red-400">{result.error}</p>
                {result.explanation && (
                  <p className="mt-1 text-red-300">{result.explanation}</p>
                )}
                {result.viewCount !== undefined && (
                  <p className="mt-1 text-red-500">Views: {result.viewCount}</p>
                )}
                {result.resubmittable && (
                  <p className="mt-2 text-amber-400">You can resubmit this post once it meets the minimum thresholds.</p>
                )}
              </div>
            )}

            {result?.success && (
              <div className="rounded-lg bg-green-500/10 p-3 text-xs">
                <p className="font-medium text-green-400">Submission approved!</p>
                <p className="mt-1 text-green-300">
                  Views: {result.viewCount?.toLocaleString()} | Pending payout: {result.payoutLamports ? formatTokenAmount(result.payoutLamports, tInfo) : '0'} {sym}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !postUrl}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-50"
            >
              {loading
                ? step === 'paying' ? `Paying ${feeSol} SOL fee...`
                  : step === 'verifying' ? 'Verifying post...'
                    : 'Processing...'
                : `Submit Post (${feeSol} SOL fee)`}
            </button>

            <ul className="mt-1 space-y-1 text-[11px] text-zinc-500">
              <li>• Submissions with artificially inflated views, likes, or engagement (e.g. bots or paid services) will be rejected and may result in a permanent ban.</li>
              <li>• Ensure your post complies with the campaign guidelines — violations may lead to account suspension.</li>
            </ul>
          </form>
        )}
      </div>
    </div>
  )
}
