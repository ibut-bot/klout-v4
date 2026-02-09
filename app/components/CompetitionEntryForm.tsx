'use client'

import { useState } from 'react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'

interface CompetitionEntryFormProps {
  taskId: string
  budgetLamports: string
  onEntrySubmitted?: () => void
}

export default function CompetitionEntryForm({
  taskId,
  budgetLamports,
  onEntrySubmitted,
}: CompetitionEntryFormProps) {
  const { authFetch, isAuthenticated } = useAuth()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'uploading' | 'submitting'>('form')
  const [error, setError] = useState('')

  const maxBudgetSol = Number(budgetLamports) / LAMPORTS_PER_SOL

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
      const amountLamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL)
      if (isNaN(amountLamports) || amountLamports <= 0) throw new Error('Invalid amount')
      if (amountLamports > Number(budgetLamports)) throw new Error(`Amount exceeds task budget of ${maxBudgetSol} SOL`)

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

      // Step 2: Submit to API (no on-chain transaction needed)
      setStep('submitting')
      const res = await authFetch(`/api/tasks/${taskId}/compete`, {
        method: 'POST',
        body: JSON.stringify({
          amountLamports,
          description,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      setAmount('')
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
    submitting: 'Submitting entry...',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Submit Competition Entry</h3>
      <p className="text-xs text-zinc-500">
        Complete the work and submit your entry. No on-chain transaction required — submitting is free.
        The task creator will review all entries and pick a winner.
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Your Price (SOL) <span className="text-zinc-400 font-normal">max {maxBudgetSol.toFixed(2)}</span>
        </label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max={maxBudgetSol}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.3"
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Your Submission</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your completed work, how to access or use it..."
          rows={5}
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Attachments {files.length > 0 && `(${files.length})`}
        </label>
        <input
          type="file"
          multiple
          onChange={handleFileChange}
          className="w-full text-sm text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-300"
        />
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="truncate">{f.name}</span>
                <span className="text-zinc-400">({(f.size / 1024).toFixed(0)} KB)</span>
                <button type="button" onClick={() => removeFile(i)} className="text-red-500 hover:text-red-600">
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
