'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { type PaymentTokenType, formatTokenAmount, tokenSymbol } from '@/lib/token-utils'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''
const X_API_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_X_API_FEE_LAMPORTS || 500000)

interface Props {
  taskId: string
  guidelines: { dos: string[]; donts: string[] }
  cpmLamports: string
  budgetRemainingLamports: string
  minPayoutLamports?: string
  minViews?: number
  collateralLink?: string | null
  xLinked: boolean
  onSubmitted: () => void
  paymentToken?: PaymentTokenType
}

export default function CampaignSubmitForm({ taskId, guidelines, cpmLamports, budgetRemainingLamports, minPayoutLamports, minViews, collateralLink, xLinked, onSubmitted, paymentToken = 'SOL' }: Props) {
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
  } | null>(null)

  const budgetExhausted = BigInt(budgetRemainingLamports) <= BigInt(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!publicKey || !xLinked || budgetExhausted) return
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

      // Step 1: Pay API fee
      setStep('paying')
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(SYSTEM_WALLET),
          lamports: X_API_FEE_LAMPORTS,
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
        onSubmitted()
      } else {
        setResult({
          success: false,
          error: data.message,
          explanation: data.explanation,
          viewCount: data.viewCount,
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

  const feeSol = (X_API_FEE_LAMPORTS / LAMPORTS_PER_SOL).toFixed(4)
  const cpmDisplay = formatTokenAmount(cpmLamports, paymentToken)
  const remainingDisplay = formatTokenAmount(budgetRemainingLamports, paymentToken, 2)
  const minPayoutDisplay = minPayoutLamports && Number(minPayoutLamports) > 0
    ? formatTokenAmount(minPayoutLamports, paymentToken)
    : null
  const sym = tokenSymbol(paymentToken)

  if (!xLinked) {
    return (
      <div className="rounded-xl border border-amber-800 bg-amber-500/10 p-4">
        <p className="text-sm text-amber-300">
          You need to link your X account before submitting to campaigns. Go to the profile dropdown and click &quot;Link X Account&quot;.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Campaign Info Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
          <p className="text-[11px] text-zinc-500">CPM (per 1,000 views)</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{cpmDisplay} {sym}</p>
        </div>
        <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
          <p className="text-[11px] text-zinc-500">Budget remaining</p>
          <p className={`mt-1 text-sm font-semibold ${budgetExhausted ? 'text-red-500' : 'text-zinc-100'}`}>{remainingDisplay} {sym}</p>
        </div>
        <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
          <p className="text-[11px] text-zinc-500">Verification fee</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{feeSol} SOL</p>
        </div>
        {minViews !== undefined && minViews > 0 && (
          <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
            <p className="text-[11px] text-zinc-500">Min views per post</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{minViews.toLocaleString()}</p>
          </div>
        )}
        {minPayoutDisplay && (
          <div className="rounded-xl border border-k-border bg-zinc-800/50 p-3">
            <p className="text-[11px] text-zinc-500">Min payout threshold</p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{minPayoutDisplay} {sym}</p>
          </div>
        )}
      </div>

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
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Submit Your Post</h3>
            <div>
              <input
                type="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://x.com/yourhandle/status/..."
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
              </div>
            )}

            {result?.success && (
              <div className="rounded-lg bg-green-500/10 p-3 text-xs">
                <p className="font-medium text-green-400">Submission approved!</p>
                <p className="mt-1 text-green-300">
                  Views: {result.viewCount?.toLocaleString()} | Pending payout: {result.payoutLamports ? formatTokenAmount(result.payoutLamports, paymentToken) : '0'} {sym}
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
