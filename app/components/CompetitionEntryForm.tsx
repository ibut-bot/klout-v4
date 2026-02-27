'use client'

import { useState } from 'react'
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''
const COMPETITION_ENTRY_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_COMPETITION_ENTRY_FEE_LAMPORTS || 1000000) // 0.001 SOL

const X_POST_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/(\d+)/
const YT_POST_REGEX = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]/
const TT_POST_REGEX = /^https?:\/\/(www\.)?(tiktok\.com\/@[^/]+\/video\/\d+|vm\.tiktok\.com\/[a-zA-Z0-9]+)/

interface CompetitionEntryFormProps {
  taskId: string
  platform?: 'X' | 'YOUTUBE' | 'TIKTOK'
  onEntrySubmitted?: () => void
}

export default function CompetitionEntryForm({
  taskId,
  platform = 'X',
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

  const isYouTube = platform === 'YOUTUBE'
  const isTikTok = platform === 'TIKTOK'
  const isValidUrl = isTikTok ? TT_POST_REGEX.test(postUrl.trim()) : isYouTube ? YT_POST_REGEX.test(postUrl.trim()) : X_POST_REGEX.test(postUrl.trim())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated) return
    setError('')

    const url = postUrl.trim()
    const urlValid = isTikTok ? TT_POST_REGEX.test(url) : isYouTube ? YT_POST_REGEX.test(url) : X_POST_REGEX.test(url)
    if (!urlValid) {
      setError(isTikTok ? 'Please enter a valid TikTok video URL' : isYouTube ? 'Please enter a valid YouTube video URL' : 'Please enter a valid X (Twitter) post URL')
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
        Submit your {isTikTok ? 'TikTok video' : isYouTube ? 'YouTube video' : 'X post'} as your competition entry.
        A small entry fee of {(COMPETITION_ENTRY_FEE_LAMPORTS / LAMPORTS_PER_SOL).toFixed(3)} SOL is required for spam prevention.
      </p>

      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">{isTikTok ? 'TikTok Video URL' : isYouTube ? 'YouTube Video URL' : 'X Post URL'}</label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            {isTikTok ? (
              <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.19 8.19 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.16z"/></svg>
            ) : isYouTube ? (
              <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            ) : (
              <svg className="h-4 w-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            )}
          </div>
          <input
            type="url"
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            placeholder={isTikTok ? 'https://tiktok.com/@username/video/...' : isYouTube ? 'https://youtube.com/watch?v=...' : 'https://x.com/username/status/123456789'}
            required
            className={`w-full rounded-lg border bg-surface pl-9 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 ${
              postUrl && !isValidUrl
                ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/50'
                : 'border-k-border focus:border-accent/50 focus:ring-accent/50'
            }`}
          />
        </div>
        {postUrl && !isValidUrl && (
          <p className="mt-1 text-xs text-red-400">{isTikTok ? 'Enter a valid TikTok video URL (e.g. https://tiktok.com/@user/video/...)' : isYouTube ? 'Enter a valid YouTube video URL (e.g. https://youtube.com/watch?v=...)' : 'Enter a valid X post URL (e.g. https://x.com/user/status/123...)'}</p>
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
        disabled={loading || !isAuthenticated || !isValidUrl}
        className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? stepLabels[step] || 'Processing...' : 'Submit Entry'}
      </button>
    </form>
  )
}
