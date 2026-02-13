'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import TaskCard from '../components/TaskCard'
import Link from 'next/link'

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
}

const STATUSES = ['all', 'open', 'completed']

type ViewMode = 'all' | 'my_tasks' | 'my_bids'

export default function TasksPage() {
  const { isAuthenticated, authFetch } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchTasks = async () => {
    setLoading(true)
    
    try {
      let data: any

      if (viewMode === 'my_tasks' && isAuthenticated) {
        // Fetch user's created tasks
        const params = new URLSearchParams({ page: String(page), limit: '20', taskType: 'CAMPAIGN' })
        if (status !== 'all') params.set('status', status)
        const res = await authFetch(`/api/me/tasks?${params}`)
        data = await res.json()
      } else if (viewMode === 'my_bids' && isAuthenticated) {
        // Fetch tasks user has bid on
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (status !== 'all') {
          // Map task statuses to bid statuses for "my bids" view
          const bidStatusMap: Record<string, string> = {
            'open': 'PENDING',
            'in_progress': 'FUNDED',
            'completed': 'COMPLETED',
            'disputed': 'DISPUTED',
          }
          if (bidStatusMap[status]) {
            params.set('status', bidStatusMap[status])
          }
        }
        const res = await authFetch(`/api/me/bids?${params}`)
        const bidsData = await res.json()
        // Transform bids into task format for display
        if (bidsData.success) {
          data = {
            success: true,
            tasks: bidsData.bids.map((b: any) => ({
              id: b.task.id,
              title: b.task.title,
              description: b.task.description,
              budgetLamports: b.task.budgetLamports,
              status: b.task.status,
              creatorWallet: b.task.creatorWallet,
              creatorProfilePic: b.task.creatorProfilePic,
              bidCount: b.task.bidCount ?? 0,
              createdAt: b.createdAt,
              // Add bid info for display
              _bidInfo: {
                bidId: b.id,
                bidAmount: b.amountLamports,
                bidStatus: b.status,
                isWinningBid: b.isWinningBid,
              },
            })),
            pagination: bidsData.pagination,
          }
        } else {
          data = bidsData
        }
      } else {
        // Fetch all marketplace tasks (campaigns only)
        const params = new URLSearchParams({ page: String(page), limit: '20', taskType: 'CAMPAIGN' })
        if (status !== 'all') params.set('status', status)
        const res = await fetch(`/api/tasks?${params}`)
        data = await res.json()
      }

      if (data.success) {
        setTasks(data.tasks)
        setTotalPages(data.pagination?.pages || 1)
      }
    } catch {
      // ignore
    }
    
    setLoading(false)
  }

  useEffect(() => {
    fetchTasks()
  }, [status, page, viewMode, isAuthenticated])

  // Reset to 'all' if user logs out while in personal view
  useEffect(() => {
    if (!isAuthenticated && viewMode !== 'all') {
      setViewMode('all')
    }
  }, [isAuthenticated, viewMode])

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-white">Browse Campaigns</h1>
        
        {/* View Mode Toggle (only when authenticated) */}
        {isAuthenticated && (
          <div className="flex gap-2">
            <button
              onClick={() => { setViewMode('all'); setPage(1); setStatus('all') }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'all'
                  ? 'bg-accent text-black'
                  : 'bg-surface text-zinc-400 hover:bg-surface-hover border border-k-border'
              }`}
            >
              All Campaigns
            </button>
            <button
              onClick={() => { setViewMode('my_tasks'); setPage(1); setStatus('all') }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'my_tasks'
                  ? 'bg-blue-500 text-white'
                  : 'bg-surface text-zinc-400 hover:bg-surface-hover border border-k-border'
              }`}
            >
              My Campaigns
            </button>
            <button
              onClick={() => { setViewMode('my_bids'); setPage(1); setStatus('all') }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'my_bids'
                  ? 'bg-green-500 text-white'
                  : 'bg-surface text-zinc-400 hover:bg-surface-hover border border-k-border'
              }`}
            >
              My Submissions
            </button>
          </div>
        )}
      </div>

      {/* Status Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1) }}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              status === s
                ? 'bg-accent text-black'
                : 'bg-surface text-zinc-400 hover:bg-surface-hover border border-k-border'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>


      {/* Info banner for personal views */}
      {viewMode === 'my_tasks' && (
        <div className="mb-4 rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-2 text-sm text-blue-400">
          Showing campaigns you created. <Link href="/dashboard" className="underline hover:no-underline">Go to Dashboard</Link> for more details.
        </div>
      )}
      {viewMode === 'my_bids' && (
        <div className="mb-4 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-2 text-sm text-green-400">
          Showing campaigns you&apos;ve submitted to. <Link href="/dashboard" className="underline hover:no-underline">Go to Dashboard</Link> for submission details.
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-k-border p-12 text-center">
          <p className="text-zinc-500 mb-4">
            {viewMode === 'my_tasks' && 'You haven\'t created any campaigns yet.'}
            {viewMode === 'my_bids' && 'You haven\'t submitted to any campaigns yet.'}
            {viewMode === 'all' && 'No campaigns found.'}
          </p>
          {viewMode === 'my_tasks' && (
            <Link
              href="/tasks/new"
              className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover"
            >
              Create Your First Campaign
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} {...task} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-k-border px-3 py-1.5 text-sm text-zinc-400 disabled:opacity-50 hover:border-k-border-hover"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-k-border px-3 py-1.5 text-sm text-zinc-400 disabled:opacity-50 hover:border-k-border-hover"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
