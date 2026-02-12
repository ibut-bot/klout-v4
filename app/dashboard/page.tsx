'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import Link from 'next/link'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

interface Task {
  id: string
  title: string
  description: string
  budgetLamports: string
  taskType?: string
  status: string
  creatorWallet: string
  creatorUsername?: string | null
  creatorProfilePic?: string | null
  bidCount: number
  submissionCount?: number
  budgetRemainingLamports?: string | null
  imageUrl?: string | null
  deadlineAt?: string | null
  createdAt: string
  winningBid?: {
    id: string
    amountLamports: string
    status: string
    bidderWallet: string
  } | null
}

interface Bid {
  id: string
  amountLamports: string
  description: string
  status: string
  createdAt: string
  isWinningBid: boolean
  task: {
    id: string
    title: string
    budgetLamports: string
    status: string
    creatorWallet: string
    url: string
  }
}

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(4)} SOL`
}

const BID_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-zinc-700/50 text-zinc-400',
  ACCEPTED: 'bg-blue-500/20 text-blue-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  FUNDED: 'bg-green-500/20 text-green-400',
  PAYMENT_REQUESTED: 'bg-amber-500/20 text-amber-400',
  COMPLETED: 'bg-zinc-700/50 text-zinc-400',
  DISPUTED: 'bg-red-500/20 text-red-400',
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-500/20 text-green-400',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-400',
  COMPLETED: 'bg-zinc-700/50 text-zinc-400',
  DISPUTED: 'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-zinc-700/50 text-zinc-500',
}

function getCountdown(deadlineAt: string): { label: string; isEnded: boolean } {
  const diff = new Date(deadlineAt).getTime() - Date.now()
  if (diff <= 0) return { label: 'Ended', isEnded: true }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return { label: `${days}d ${hours}h left`, isEnded: false }
  if (hours > 0) return { label: `${hours}h ${minutes}m left`, isEnded: false }
  return { label: `${minutes}m left`, isEnded: false }
}

interface CampaignCardProps {
  task: Task
  onImageUpdate: (taskId: string, newImageUrl: string | null) => void
  authFetch: (url: string, options?: RequestInit) => Promise<Response>
}

function CampaignCard({ task, onImageUpdate, authFetch }: CampaignCardProps) {
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [countdown, setCountdown] = useState<{ label: string; isEnded: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const budgetTotal = Number(task.budgetLamports)
  const budgetRemaining = task.budgetRemainingLamports ? Number(task.budgetRemainingLamports) : budgetTotal
  const budgetUsedPercent = budgetTotal > 0 ? Math.round(((budgetTotal - budgetRemaining) / budgetTotal) * 100) : 0

  useEffect(() => {
    if (!task.deadlineAt) return
    const update = () => setCountdown(getCountdown(task.deadlineAt!))
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [task.deadlineAt])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be less than 10MB')
      return
    }

    setUploading(true)
    try {
      // Upload the image
      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await authFetch('/api/upload', { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()
      if (!uploadData.success) throw new Error(uploadData.message || 'Upload failed')

      // Update the task with new image URL
      const updateRes = await authFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageUrl: uploadData.url }),
      })
      const updateData = await updateRes.json()
      if (!updateData.success) throw new Error(updateData.message || 'Update failed')

      onImageUpdate(task.id, uploadData.url)
      setEditing(false)
    } catch (err: any) {
      alert(err.message || 'Failed to update image')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveImage = async () => {
    if (!confirm('Remove campaign image?')) return
    setUploading(true)
    try {
      const res = await authFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageUrl: null }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Update failed')
      onImageUpdate(task.id, null)
      setEditing(false)
    } catch (err: any) {
      alert(err.message || 'Failed to remove image')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-k-border bg-surface overflow-hidden">
      {/* Image Section */}
      <div className="relative h-40 bg-zinc-900">
        {task.imageUrl ? (
          <img src={task.imageUrl} alt={task.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Edit overlay */}
        {editing ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black hover:bg-accent-hover disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload New'}
            </button>
            {task.imageUrl && (
              <button
                onClick={handleRemoveImage}
                disabled={uploading}
                className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                Remove
              </button>
            )}
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white hover:bg-black/80 backdrop-blur-sm"
          >
            Edit Image
          </button>
        )}

        {/* Countdown badge */}
        {countdown && (
          <div className={`absolute top-2 left-2 rounded-lg px-2 py-1 text-xs font-medium backdrop-blur-sm ${
            countdown.isEnded ? 'bg-red-500/90 text-white' : 'bg-black/70 text-white'
          }`}>
            {countdown.label}
          </div>
        )}

        {/* Status badge */}
        <span className={`absolute top-2 right-2 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status] || ''}`}>
          {task.status.replace('_', ' ')}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        <Link href={`/tasks/${task.id}`} className="hover:underline">
          <h3 className="font-semibold text-zinc-100 truncate">{task.title}</h3>
        </Link>

        {/* Budget Progress */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Budget Used</span>
            <span className="font-medium text-zinc-300">
              {formatSol(budgetRemaining)} / {formatSol(task.budgetLamports)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${budgetUsedPercent}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="mt-3 flex items-center gap-4 text-sm text-zinc-500">
          <span className="flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {task.submissionCount ?? task.bidCount} participants
          </span>
          <span>{new Date(task.createdAt).toLocaleDateString()}</span>
        </div>

        <Link
          href={`/tasks/${task.id}`}
          className="mt-3 block w-full rounded-lg bg-accent py-2 text-center text-sm font-semibold text-black transition hover:bg-accent-hover"
        >
          View Campaign
        </Link>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { isAuthenticated, connected, wallet, authFetch } = useAuth()
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [myBids, setMyBids] = useState<Bid[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [loadingBids, setLoadingBids] = useState(true)
  const [activeTab, setActiveTab] = useState<'tasks' | 'bids'>('tasks')

  useEffect(() => {
    if (!isAuthenticated) return

    const fetchTasks = async () => {
      setLoadingTasks(true)
      try {
        const params = new URLSearchParams({ limit: '50', taskType: 'CAMPAIGN' })
        const res = await authFetch(`/api/me/tasks?${params}`)
        const data = await res.json()
        if (data.success) {
          setMyTasks(data.tasks)
        }
      } catch {
        // ignore
      } finally {
        setLoadingTasks(false)
      }
    }

    const fetchBids = async () => {
      setLoadingBids(true)
      try {
        const res = await authFetch('/api/me/bids?limit=50')
        const data = await res.json()
        if (data.success) {
          setMyBids(data.bids)
        }
      } catch {
        // ignore
      } finally {
        setLoadingBids(false)
      }
    }

    fetchTasks()
    fetchBids()
  }, [isAuthenticated, authFetch])

  if (!connected) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-500">Connect your wallet to view your dashboard.</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-500">Sign in with your wallet to view your dashboard.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <Link
          href="/tasks/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent-hover"
        >
          Create Campaign
        </Link>
      </div>

      <div className="mb-6 rounded-lg bg-surface border border-k-border px-4 py-3 text-sm text-zinc-400">
        Wallet: <Link href={`/u/${wallet}`} className="font-mono hover:text-accent">{wallet}</Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-k-border">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'tasks'
              ? 'border-accent text-accent'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          My Campaigns ({myTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('bids')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'bids'
              ? 'border-accent text-accent'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          My Submissions ({myBids.length})
        </button>
      </div>

      {/* My Campaigns Tab */}
      {activeTab === 'tasks' && (
        <section>
          {loadingTasks ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-xl bg-surface" />
              ))}
            </div>
          ) : myTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-k-border p-8 text-center">
              <p className="text-zinc-500 mb-4">You haven&apos;t created any campaigns yet.</p>
              <Link
                href="/tasks/new"
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover"
              >
                Create Your First Campaign
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {myTasks.map((task) => (
                <CampaignCard
                  key={task.id}
                  task={task}
                  authFetch={authFetch}
                  onImageUpdate={(taskId, newImageUrl) => {
                    setMyTasks(prev => prev.map(t =>
                      t.id === taskId ? { ...t, imageUrl: newImageUrl } : t
                    ))
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* My Submissions Tab */}
      {activeTab === 'bids' && (
        <section>
          {loadingBids ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
              ))}
            </div>
          ) : myBids.length === 0 ? (
            <div className="rounded-xl border border-dashed border-k-border p-8 text-center">
              <p className="text-zinc-500 mb-4">You haven&apos;t submitted to any campaigns yet.</p>
              <Link
                href="/tasks"
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover"
              >
                Browse Campaigns
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {myBids.map((bid) => (
                <Link
                  key={bid.id}
                  href={`/tasks/${bid.task.id}`}
                  className="block rounded-xl border border-k-border bg-surface p-4 hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-zinc-100 truncate">
                        {bid.task.title}
                      </h3>
                      <p className="text-sm text-zinc-500">Campaign budget: {formatSol(bid.task.budgetLamports)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${BID_STATUS_COLORS[bid.status]}`}>
                        {bid.status.replace('_', ' ')}
                      </span>
                      {bid.isWinningBid && (
                        <span className="text-xs text-green-400 font-medium">
                          Winning Bid
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">
                      Your bid: <span className="font-semibold text-zinc-100">{formatSol(bid.amountLamports)}</span>
                    </span>
                    <span className="text-zinc-500">
                      {new Date(bid.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
