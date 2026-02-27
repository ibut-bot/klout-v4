'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import TaskCard from '../components/TaskCard'
import { type ImageTransform } from '../components/ImagePositionEditor'
import Link from 'next/link'
import BuffedShowcase from '../components/BuffedShowcase'

const taskCache = new Map<string, { tasks: Task[]; totalPages: number; ts: number }>()
const CACHE_TTL = 30_000

interface Task {
  id: string
  title: string
  description: string
  budgetLamports: string
  taskType?: string
  paymentToken?: string
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
  customTokenLogoUri?: string | null
  status: string
  creatorWallet: string
  creatorUsername?: string | null
  creatorProfilePic?: string | null
  bidCount: number
  submissionCount?: number
  budgetRemainingLamports?: string | null
  platform?: string
  imageUrl?: string | null
  imageTransform?: ImageTransform | null
  maxWinners?: number
  prizeStructure?: { place: number; amountLamports: string }[] | null
  competitionWinners?: { place: number; status: string; bidderUsername?: string | null; bidderWallet: string }[] | null
  deadlineAt?: string | null
  createdAt: string
  totalViews?: number | null
}

const STATUSES = ['open', 'paused', 'completed']

type TaskTypeTab = 'ALL' | 'CAMPAIGN' | 'COMPETITION'
type ViewMode = 'all' | 'my_tasks' | 'my_bids' | 'shared'

export default function TasksPage() {
  const { isAuthenticated, authFetch, wallet } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [taskTypeTab, setTaskTypeTab] = useState<TaskTypeTab>('ALL')
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const fetchIdRef = useRef(0)

  const cacheKey = useMemo(
    () => `${viewMode}:${taskTypeTab}:${status}:${page}:${isAuthenticated}`,
    [viewMode, taskTypeTab, status, page, isAuthenticated]
  )

  const fetchTasks = async () => {
    const fetchId = ++fetchIdRef.current

    const cached = taskCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setTasks(cached.tasks)
      setTotalPages(cached.totalPages)
      setLoading(false)
      return
    }

    setLoading(true)
    
    try {
      let data: any

      if (viewMode === 'my_tasks' && isAuthenticated) {
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (taskTypeTab !== 'ALL') params.set('taskType', taskTypeTab)
        if (status !== 'all') params.set('status', status)
        const res = await authFetch(`/api/me/tasks?${params}`)
        data = await res.json()
      } else if (viewMode === 'shared' && isAuthenticated) {
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (status !== 'all') params.set('status', status)
        const res = await authFetch(`/api/me/shared-campaigns?${params}`)
        data = await res.json()
      } else if (viewMode === 'my_bids' && isAuthenticated) {
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (status !== 'all') {
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
        const params = new URLSearchParams({ page: String(page), limit: '20' })
        if (taskTypeTab !== 'ALL') params.set('taskType', taskTypeTab)
        const effectiveStatus = isAuthenticated ? (status === 'all' ? 'open' : status) : 'all'
        if (effectiveStatus !== 'all') params.set('status', effectiveStatus)
        const res = await fetch(`/api/tasks?${params}`)
        data = await res.json()
      }

      if (fetchId !== fetchIdRef.current) return

      if (data.success) {
        setTasks(data.tasks)
        setTotalPages(data.pagination?.pages || 1)
        taskCache.set(cacheKey, { tasks: data.tasks, totalPages: data.pagination?.pages || 1, ts: Date.now() })
      }
    } catch {
      // ignore
    }
    
    if (fetchId === fetchIdRef.current) setLoading(false)
  }

  useEffect(() => {
    fetchTasks()
  }, [status, page, viewMode, isAuthenticated, taskTypeTab])

  const handleImageTransformSave = useCallback(async (taskId: string, transform: ImageTransform) => {
    if (!isAuthenticated) return
    try {
      const res = await authFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageTransform: transform }),
      })
      const data = await res.json()
      if (data.success) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, imageTransform: transform } : t))
      }
    } catch { /* silent */ }
  }, [isAuthenticated, authFetch])

  // Reset to 'all' if user logs out while in personal view
  useEffect(() => {
    if (!isAuthenticated && viewMode !== 'all') {
      setViewMode('all')
    }
  }, [isAuthenticated, viewMode])


  return (
    <div>
      {/* Hero */}
      <section className="mb-8 sm:mb-12 text-center">
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
          Monetize your <span className="text-accent">Klout</span>
        </h1>
        <p className="mx-auto mb-8 max-w-xl text-lg text-zinc-400">
          Get paid to promote brands and products to your audience.
        </p>
      </section>

      <BuffedShowcase />

      {/* Task Type Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-surface p-1 border border-k-border w-fit">
        <button
          onClick={() => { setTaskTypeTab('ALL'); setPage(1) }}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            taskTypeTab === 'ALL'
              ? 'bg-accent text-black'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All
        </button>
        <button
          onClick={() => { setTaskTypeTab('CAMPAIGN'); setPage(1); setStatus('open') }}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            taskTypeTab === 'CAMPAIGN'
              ? 'bg-accent text-black'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Campaigns
        </button>
        <button
          onClick={() => { setTaskTypeTab('COMPETITION'); setPage(1); setStatus('open') }}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            taskTypeTab === 'COMPETITION'
              ? 'bg-amber-500 text-black'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Competitions
        </button>
      </div>

      <div className="mb-6" />

      {/* Status Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const isActive = status === s || (isAuthenticated && s === 'open' && status === 'all')
          return (
            <button
              key={s}
              onClick={() => { setStatus(status === s ? 'all' : s); setPage(1) }}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                isActive
                  ? 'bg-accent text-black'
                  : 'bg-surface text-zinc-400 hover:bg-surface-hover border border-k-border'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          )
        })}
      </div>


      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : tasks.filter(t => t.imageUrl).length === 0 ? (
        <div className="rounded-xl border border-dashed border-k-border p-12 text-center">
          <p className="text-zinc-500 mb-4">
            {`No ${taskTypeTab === 'COMPETITION' ? 'competitions' : 'campaigns'} found.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.filter(t => t.imageUrl).map((task) => (
            <TaskCard
              key={task.id}
              {...task}
              isCreator={wallet === task.creatorWallet}
              onImageTransformSave={wallet === task.creatorWallet ? handleImageTransformSave : undefined}
            />
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
