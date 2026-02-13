'use client'

import { useEffect, useState } from 'react'
import TaskCard from './components/TaskCard'
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

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ status: 'open', limit: '12', taskType: 'CAMPAIGN' })
    fetch(`/api/tasks?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setTasks(data.tasks)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      {/* Hero */}
      <section className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Monetize your <span className="text-accent">Klout</span>
        </h1>
        <p className="mx-auto mb-8 max-w-xl text-lg text-zinc-400">
          Get paid to promote brands and products to your audience.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/tasks/new"
            className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-black transition hover:bg-accent-hover"
          >
            Launch Campaign
          </Link>
          <Link
            href="/tasks"
            className="rounded-lg border border-k-border px-6 py-3 text-sm font-medium text-zinc-300 transition hover:border-k-border-hover hover:text-white"
          >
            Browse Campaigns
          </Link>
        </div>
      </section>

      {/* Recent Tasks */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-white">Open Campaigns</h2>
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
            <p className="text-zinc-500">No open campaigns yet. Be the first to post one!</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <TaskCard key={task.id} {...task} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
