'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import TaskCard from '../components/TaskCard'
import Link from 'next/link'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

interface Task {
  id: string
  title: string
  description: string
  budgetLamports: string
  status: string
  creatorWallet: string
  creatorProfilePic?: string | null
  bidCount: number
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
  PENDING: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  ACCEPTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  FUNDED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PAYMENT_REQUESTED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  COMPLETED: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  DISPUTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
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
        const res = await authFetch('/api/me/tasks?limit=50')
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

      <div className="mb-6 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        Wallet: <span className="font-mono">{wallet}</span>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'tasks'
              ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          My Tasks ({myTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('bids')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'bids'
              ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          My Bids ({myBids.length})
        </button>
      </div>

      {/* My Tasks Tab */}
      {activeTab === 'tasks' && (
        <section>
          {loadingTasks ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
              ))}
            </div>
          ) : myTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-800">
              <p className="text-zinc-500 mb-4">You haven&apos;t posted any tasks yet.</p>
              <Link
                href="/tasks/new"
                className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Post Your First Task
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {myTasks.map((task) => (
                <TaskCard key={task.id} {...task} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* My Bids Tab */}
      {activeTab === 'bids' && (
        <section>
          {loadingBids ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
              ))}
            </div>
          ) : myBids.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-800">
              <p className="text-zinc-500 mb-4">You haven&apos;t placed any bids yet.</p>
              <Link
                href="/tasks"
                className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Browse Tasks
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {myBids.map((bid) => (
                <Link
                  key={bid.id}
                  href={`/tasks/${bid.task.id}`}
                  className="block rounded-xl border border-zinc-200 p-4 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {bid.task.title}
                      </h3>
                      <p className="text-sm text-zinc-500">Task budget: {formatSol(bid.task.budgetLamports)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${BID_STATUS_COLORS[bid.status]}`}>
                        {bid.status.replace('_', ' ')}
                      </span>
                      {bid.isWinningBid && (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                          Winning Bid
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Your bid: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatSol(bid.amountLamports)}</span>
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
