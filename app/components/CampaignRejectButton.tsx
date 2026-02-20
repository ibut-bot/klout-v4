'use client'

import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

const REJECTION_PRESETS = ['Botting', 'Quality', 'Relevancy', 'Other'] as const

interface Props {
  taskId: string
  submissionId: string
  onRejected: () => void
}

export default function CampaignRejectButton({ taskId, submissionId, onRejected }: Props) {
  const { authFetch } = useAuth()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>('')
  const [customReason, setCustomReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleReject = async () => {
    if (!reason) return
    if (reason === 'Other' && !customReason.trim()) return
    setError('')
    setLoading(true)

    try {
      const res = await authFetch(`/api/tasks/${taskId}/campaign-submissions/${submissionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          ...(reason === 'Other' ? { customReason: customReason.trim() } : {}),
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      setOpen(false)
      onRejected()
    } catch (e: any) {
      setError(e.message || 'Failed to reject')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
      >
        Reject
      </button>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-900/10">
      <select
        value={reason}
        onChange={(e) => { setReason(e.target.value); setError('') }}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <option value="">Select reason...</option>
        {REJECTION_PRESETS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {reason === 'Other' && (
        <input
          type="text"
          value={customReason}
          onChange={(e) => setCustomReason(e.target.value)}
          placeholder="Enter rejection reason..."
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleReject}
          disabled={loading || !reason || (reason === 'Other' && !customReason.trim())}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Rejecting...' : 'Confirm Reject'}
        </button>
        <button
          onClick={() => { setOpen(false); setReason(''); setCustomReason(''); setError('') }}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
