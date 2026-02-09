'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import Link from 'next/link'

interface UserStats {
  user: {
    walletAddress: string
    profilePicUrl: string | null
    memberSince: string
  }
  asClient: {
    totalTasksPosted: number
    totalTaskBudgetLamports: string
    tasksOpen: number
    tasksInProgress: number
    tasksCompleted: number
    tasksCancelled: number
    tasksDisputed: number
    amountPaidOutLamports: string
    disputes: {
      total: number
      pending: number
      inFavor: number
      against: number
    }
  }
  asWorker: {
    totalBidsPlaced: number
    totalBidValueLamports: string
    tasksWon: number
    tasksInProgress: number
    tasksCompleted: number
    tasksDisputed: number
    amountReceivedLamports: string
    disputes: {
      total: number
      pending: number
      inFavor: number
      against: number
    }
  }
}

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(4)} SOL`
}

function StatCard({
  label,
  value,
  subValue,
}: {
  label: string
  value: string | number
  subValue?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
      {subValue && <p className="text-sm text-zinc-500 dark:text-zinc-400">{subValue}</p>}
    </div>
  )
}

function DisputeStats({
  disputes,
}: {
  disputes: { total: number; pending: number; inFavor: number; against: number }
}) {
  if (disputes.total === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No disputes</p>
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-zinc-500 dark:text-zinc-400">Total Disputes</span>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{disputes.total}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500 dark:text-zinc-400">Pending</span>
        <span className="font-medium text-amber-600 dark:text-amber-400">{disputes.pending}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500 dark:text-zinc-400">In Favor</span>
        <span className="font-medium text-green-600 dark:text-green-400">{disputes.inFavor}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-500 dark:text-zinc-400">Against</span>
        <span className="font-medium text-red-600 dark:text-red-400">{disputes.against}</span>
      </div>
    </div>
  )
}

export default function PublicProfilePage() {
  const { wallet } = useParams<{ wallet: string }>()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/users/${wallet}/stats`)
        const data = await res.json()
        if (data.success) {
          setStats(data)
        } else {
          setError(data.message || 'Failed to load profile')
        }
      } catch {
        setError('Failed to load profile')
      } finally {
        setLoading(false)
      }
    }

    if (wallet) {
      fetchStats()
    }
  }, [wallet])

  const copyWallet = () => {
    navigator.clipboard.writeText(wallet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-20 w-20 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900 mb-4" />
        <div className="h-8 w-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900 mb-4" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-4xl text-center py-16">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Profile Not Found</h1>
        <p className="text-zinc-500 mb-6">{error || 'This user has not joined the platform yet.'}</p>
        <Link
          href="/tasks"
          className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Browse Tasks
        </Link>
      </div>
    )
  }

  const { user, asClient, asWorker } = stats

  return (
    <div className="mx-auto max-w-4xl">
      {/* Profile Header */}
      <div className="mb-8 flex items-start gap-4">
        {user.profilePicUrl ? (
          <img
            src={user.profilePicUrl}
            alt=""
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-200 text-2xl font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
            {user.walletAddress.slice(0, 2)}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 font-mono">
              {user.walletAddress.slice(0, 8)}...{user.walletAddress.slice(-6)}
            </h1>
            <button
              onClick={copyWallet}
              className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Member since {new Date(user.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* As Client Section */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          As Task Poster
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
          <StatCard
            label="Tasks Posted"
            value={asClient.totalTasksPosted}
            subValue={`Total value: ${formatSol(asClient.totalTaskBudgetLamports)}`}
          />
          <StatCard
            label="Tasks Completed"
            value={asClient.tasksCompleted}
          />
          <StatCard
            label="Amount Paid Out"
            value={formatSol(asClient.amountPaidOutLamports)}
          />
        </div>

        {/* Task Status Breakdown */}
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 mb-4">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-3">Task Status Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Open</p>
              <p className="font-semibold text-green-600 dark:text-green-400">{asClient.tasksOpen}</p>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">In Progress</p>
              <p className="font-semibold text-blue-600 dark:text-blue-400">{asClient.tasksInProgress}</p>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Completed</p>
              <p className="font-semibold text-zinc-600 dark:text-zinc-400">{asClient.tasksCompleted}</p>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Disputed</p>
              <p className="font-semibold text-red-600 dark:text-red-400">{asClient.tasksDisputed}</p>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Cancelled</p>
              <p className="font-semibold text-zinc-500">{asClient.tasksCancelled}</p>
            </div>
          </div>
        </div>

        {/* Disputes as Client */}
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-3">Disputes (as Task Poster)</h3>
          <DisputeStats disputes={asClient.disputes} />
        </div>
      </section>

      {/* As Worker Section */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          As Worker
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
          <StatCard
            label="Bids Placed"
            value={asWorker.totalBidsPlaced}
            subValue={`Total value: ${formatSol(asWorker.totalBidValueLamports)}`}
          />
          <StatCard
            label="Tasks Won"
            value={asWorker.tasksWon}
          />
          <StatCard
            label="Amount Received"
            value={formatSol(asWorker.amountReceivedLamports)}
          />
        </div>

        {/* Bid Status Breakdown */}
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 mb-4">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-3">Work Status Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Tasks Won</p>
              <p className="font-semibold text-green-600 dark:text-green-400">{asWorker.tasksWon}</p>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">In Progress</p>
              <p className="font-semibold text-blue-600 dark:text-blue-400">{asWorker.tasksInProgress}</p>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Completed</p>
              <p className="font-semibold text-zinc-600 dark:text-zinc-400">{asWorker.tasksCompleted}</p>
            </div>
            <div>
              <p className="text-zinc-500 dark:text-zinc-400">Disputed</p>
              <p className="font-semibold text-red-600 dark:text-red-400">{asWorker.tasksDisputed}</p>
            </div>
          </div>
        </div>

        {/* Disputes as Worker */}
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-3">Disputes (as Worker)</h3>
          <DisputeStats disputes={asWorker.disputes} />
        </div>
      </section>
    </div>
  )
}
