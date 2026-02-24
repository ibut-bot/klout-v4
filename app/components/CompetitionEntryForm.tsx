'use client'

import { useState } from 'react'
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''
const COMPETITION_ENTRY_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_COMPETITION_ENTRY_FEE_LAMPORTS || 1000000) // 0.001 SOL

const X_POST_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/(\d+)/

interface CompetitionEntryFormProps {
  taskId: string
  onEntrySubmitted?: () => void
}

export default function CompetitionEntryForm({
  taskId,
  onEntrySubmitted,
}: CompetitionEntryFormProps) {
  const { authFetch, isAuthenticated } = useAuth()
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const [postUrl, setPostUrl] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'fee' | 'submitting'>('form')
  const [error, setError] = useState('')

  const isValidXUrl = X_POST_REGEX.test(postUrl.trim())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated) return
    setError('')

    const url = postUrl.trim()
    if (!X_POST_REGEX.test(url)) {
      setError('Please enter a valid X (Twitter) post URL')
      return
    }

    setLoading(true)

    try {
      // Build the description: X post URL + optional notes
      const fullDescription = description.trim()
        ? `${url}\n\n${description.trim()}`
        : url

      // Pay entry fee
      setStep('fee')
      if (!publicKey || !SYSTEM_WALLET) throw new Error('Wallet not connected or system wallet not configured')
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.lastValidBlockHeight = lastValidBlockHeight
      tx.feePayer = publicKey
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(SYSTEM_WALLET),
          lamports: COMPETITION_ENTRY_FEE_LAMPORTS,
        })
      )
      const feeSig = await sendTransaction(tx, connection)
      await connection.confirmTransaction({ signature: feeSig, blockhash, lastValidBlockHeight }, 'confirmed')

      // Submit to API
      setStep('submitting')
      const res = await authFetch(`/api/tasks/${taskId}/compete`, {
        method: 'POST',
        body: JSON.stringify({
          description: fullDescription,
          entryFeeTxSignature: feeSig,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      setPostUrl('')
      setDescription('')
      setStep('form')
      onEntrySubmitted?.()
    } catch (e: any) {
      setError(e.message || 'Failed to submit entry')
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  const stepLabels: Record<string, string> = {
    fee: 'Paying entry fee...',
    submitting: 'Submitting entry...',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-k-border p-5">
      <h3 className="text-lg font-semibold text-white">Submit Competition Entry</h3>
      <p className="text-xs text-zinc-500">
        Submit your X post as your competition entry.
        A small entry fee of {(COMPETITION_ENTRY_FEE_LAMPORTS / LAMPORTS_PER_SOL).toFixed(3)} SOL is required for spam prevention.
      </p>

      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">X Post URL</label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg className="h-4 w-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
          <input
            type="url"
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            placeholder="https://x.com/username/status/123456789"
            required
            className={`w-full rounded-lg border bg-surface pl-9 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 ${
              postUrl && !isValidXUrl
                ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/50'
                : 'border-k-border focus:border-accent/50 focus:ring-accent/50'
            }`}
          />
        </div>
        {postUrl && !isValidXUrl && (
          <p className="mt-1 text-xs text-red-400">Enter a valid X post URL (e.g. https://x.com/user/status/123...)</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Additional Notes <span className="text-zinc-500">(optional)</span></label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Any extra context about your submission..."
          rows={3}
          className="w-full rounded-lg border border-k-border bg-surface px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !isAuthenticated || !isValidXUrl}
        className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? stepLabels[step] || 'Processing...' : 'Submit Entry'}
      </button>
    </form>
  )
}
