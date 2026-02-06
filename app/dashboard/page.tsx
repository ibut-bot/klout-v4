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
  status: string
  creatorWallet: string
  bidCount: number
  createdAt: string
}

export default function DashboardPage() {
  const { isAuthenticated, connected, wallet, authFetch } = useAuth()
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [myBids, setMyBids] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) return

    const fetchData = async () => {
      setLoading(true)
      try {
        // Get all tasks and filter client-side (simple approach)
        const tasksRes = await fetch('/api/tasks?limit=50')
        const tasksData = await tasksRes.json()

        if (tasksData.success) {
          setMyTasks(tasksData.tasks.filter((t: Task) => t.creatorWallet === wallet))
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isAuthenticated, wallet])

  if (!connected) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <p className="text-zinc-500">Connect your wallet to view your dashboard.</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <p className="text-zinc-500">Sign in with your wallet to view your dashboard.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <Link
          href="/tasks/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Post a Task
        </Link>
      </div>

      <div className="mb-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        Wallet: <span className="font-mono">{wallet}</span>
      </div>

      {/* My Tasks */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          My Tasks ({myTasks.length})
        </h2>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
            ))}
          </div>
        ) : myTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-800">
            <p className="text-zinc-500">You haven't posted any tasks yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {myTasks.map((task) => (
              <TaskCard key={task.id} {...task} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
