'use client'

import { useState } from 'react'
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''
const COMPETITION_ENTRY_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_COMPETITION_ENTRY_FEE_LAMPORTS || 1000000) // 0.001 SOL

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
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'uploading' | 'fee' | 'submitting'>('form')
  const [error, setError] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files).slice(0, 20))
    }
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated) return
    setError('')
    setLoading(true)

    try {
      // Step 1: Upload files (optional)
      let attachments: any[] = []
      if (files.length > 0) {
        setStep('uploading')
        for (const file of files) {
          const formData = new FormData()
          formData.append('file', file)
          const uploadRes = await authFetch('/api/upload', {
            method: 'POST',
            body: formData,
            headers: {},
          })
          const uploadData = await uploadRes.json()
          if (!uploadData.success) throw new Error(uploadData.message || 'File upload failed')
          attachments.push({
            url: uploadData.url,
            key: uploadData.key,
            contentType: uploadData.contentType,
            size: uploadData.size,
            filename: file.name,
          })
        }
      }

      // Step 2: Pay entry fee (0.001 SOL spam prevention)
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

      // Step 3: Submit to API with entry fee signature
      setStep('submitting')
      const res = await authFetch(`/api/tasks/${taskId}/compete`, {
        method: 'POST',
        body: JSON.stringify({
          description,
          attachments: attachments.length > 0 ? attachments : undefined,
          entryFeeTxSignature: feeSig,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      setDescription('')
      setFiles([])
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
    uploading: 'Uploading files...',
    fee: 'Paying entry fee...',
    submitting: 'Submitting entry...',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-k-border p-5">
      <h3 className="text-lg font-semibold text-white">Submit Competition Entry</h3>
      <p className="text-xs text-zinc-500">
        Complete the work and submit your entry. The winner receives the full competition budget.
        A small entry fee of {(COMPETITION_ENTRY_FEE_LAMPORTS / LAMPORTS_PER_SOL).toFixed(3)} SOL is required for spam prevention.
      </p>

      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Your Submission</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your completed work, how to access or use it..."
          rows={5}
          required
          className="w-full rounded-lg border border-k-border bg-surface px-3 py-2 text-sm text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">
          Attachments {files.length > 0 && `(${files.length})`}
        </label>
        <input
          type="file"
          multiple
          onChange={handleFileChange}
          className="w-full text-sm text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-300 hover:file:bg-zinc-700 text-zinc-400 file:bg-zinc-800 file:text-zinc-300"
        />
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="truncate">{f.name}</span>
                <span className="text-zinc-400">({(f.size / 1024).toFixed(0)} KB)</span>
                <button type="button" onClick={() => removeFile(i)} className="text-red-500 hover:text-red-400">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !isAuthenticated}
        className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? stepLabels[step] || 'Processing...' : 'Submit Entry'}
      </button>
    </form>
  )
}
