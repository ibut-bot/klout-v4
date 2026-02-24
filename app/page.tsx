'use client'

import { useEffect, useState, useCallback } from 'react'
import TaskCard from './components/TaskCard'
import { type ImageTransform } from './components/ImagePositionEditor'
import Link from 'next/link'
import { useAuth } from './hooks/useAuth'

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
  heading?: string | null
  imageUrl?: string | null
  imageTransform?: ImageTransform | null
  maxWinners?: number
  prizeStructure?: { place: number; amountLamports: string }[] | null
  competitionWinners?: { place: number; status: string; bidderUsername?: string | null; bidderWallet: string }[] | null
  deadlineAt?: string | null
  createdAt: string
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'paused' | 'completed'>('open')
  const { wallet, authFetch, isAuthenticated } = useAuth()

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ status: filter, limit: '12', taskType: 'CAMPAIGN' })
    fetch(`/api/tasks?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setTasks(data.tasks)
      })
      .finally(() => setLoading(false))
  }, [filter])

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
    } catch {
      // silent
    }
  }, [isAuthenticated, authFetch])

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
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Link
            href="/tasks/new"
            className="w-full sm:w-auto rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-black transition hover:bg-accent-hover text-center"
          >
            Launch Campaign
          </Link>
          <Link
            href="/tasks"
            className="w-full sm:w-auto rounded-lg border border-k-border px-6 py-3 text-sm font-medium text-zinc-300 transition hover:border-k-border-hover hover:text-white text-center"
          >
            Browse Campaigns
          </Link>
        </div>
      </section>

      {/* Recent Tasks */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setFilter('open')}
              className={`text-2xl font-semibold transition ${filter === 'open' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              Open
            </button>
            <button
              onClick={() => setFilter('paused')}
              className={`text-2xl font-semibold transition ${filter === 'paused' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              Paused
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`text-2xl font-semibold transition ${filter === 'completed' ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              Completed
            </button>
          </div>
          <Link href="/tasks" className="text-sm text-zinc-500 transition hover:text-accent">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-k-border p-12 text-center">
            <p className="text-zinc-500">
              {filter === 'open' ? 'No open campaigns yet. Be the first to post one!' : filter === 'paused' ? 'No paused campaigns.' : 'No completed campaigns yet.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                {...task}
                isCreator={wallet === task.creatorWallet}
                onImageTransformSave={wallet === task.creatorWallet ? handleImageTransformSave : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
