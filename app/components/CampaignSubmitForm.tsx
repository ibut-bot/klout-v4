'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''
const X_API_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_X_API_FEE_LAMPORTS || 500000)

interface Props {
  taskId: string
  guidelines: { dos: string[]; donts: string[] }
  cpmLamports: string
  budgetRemainingLamports: string
  minPayoutLamports?: string
  minViews?: number
  xLinked: boolean
  onSubmitted: () => void
}

export default function CampaignSubmitForm({ taskId, guidelines, cpmLamports, budgetRemainingLamports, minPayoutLamports, minViews, xLinked, onSubmitted }: Props) {
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
  const cpmSol = (Number(cpmLamports) / LAMPORTS_PER_SOL).toFixed(4)
  const remainingSol = (Number(budgetRemainingLamports) / LAMPORTS_PER_SOL).toFixed(4)
  const minPayoutSol = minPayoutLamports && Number(minPayoutLamports) > 0
    ? (Number(minPayoutLamports) / LAMPORTS_PER_SOL).toFixed(4)
    : null

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
    <div className="rounded-xl border border-k-border p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">Submit Your Post</h3>

      {/* Campaign Info */}
      <div className="mb-4 space-y-2 rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-400">
        <div className="flex justify-between">
          <span>CPM (per 1,000 views):</span>
          <span className="font-medium text-zinc-100">{cpmSol} SOL</span>
        </div>
        <div className="flex justify-between">
          <span>Budget remaining:</span>
          <span className={`font-medium ${budgetExhausted ? 'text-red-500' : 'text-zinc-100'}`}>{remainingSol} SOL</span>
        </div>
        <div className="flex justify-between">
          <span>Verification fee:</span>
          <span className="font-medium text-zinc-100">{feeSol} SOL</span>
        </div>
        {minViews !== undefined && minViews > 0 && (
          <div className="flex justify-between">
            <span>Min views per post:</span>
            <span className="font-medium text-zinc-100">{minViews.toLocaleString()}</span>
          </div>
        )}
        {minPayoutSol && (
          <div className="flex justify-between">
            <span>Min payout threshold:</span>
            <span className="font-medium text-zinc-100">{minPayoutSol} SOL</span>
          </div>
        )}
      </div>

      {/* Guidelines */}
      {(guidelines.dos.length > 0 || guidelines.donts.length > 0) && (
        <div className="mb-4 space-y-2 text-xs">
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

      {budgetExhausted ? (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          Campaign budget has been exhausted. No more submissions accepted.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
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
                Views: {result.viewCount?.toLocaleString()} | Pending payout: {result.payoutLamports ? (Number(result.payoutLamports) / LAMPORTS_PER_SOL).toFixed(4) : '0'} SOL
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
        </form>
      )}
    </div>
  )
}
