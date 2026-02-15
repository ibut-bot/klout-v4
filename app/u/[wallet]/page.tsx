'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import Link from 'next/link'

interface UserStats {
  user: {
    walletAddress: string
    username: string | null
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

interface UserSubmission {
  id: string
  description: string
  attachments: any[] | null
  createdAt: string
  outcome: 'won' | 'lost' | 'pending' | 'in_progress'
  bid: {
    id: string
    amountLamports: string
    status: string
  }
  task: {
    id: string
    title: string
    taskType: string
    status: string
    budgetLamports: string
    creatorWallet: string
    creatorUsername: string | null
    creatorProfilePic: string | null
    url: string
  }
  payout: {
    bidAmountLamports: string
    payoutLamports: string
    platformFeeLamports: string
    paid: boolean
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
    <div className="rounded-xl border border-k-border p-4">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subValue && <p className="text-sm text-zinc-400">{subValue}</p>}
    </div>
  )
}

function DisputeStats({
  disputes,
}: {
  disputes: { total: number; pending: number; inFavor: number; against: number }
}) {
  if (disputes.total === 0) {
    return <p className="text-sm text-zinc-400">No disputes</p>
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-zinc-400">Total Disputes</span>
        <span className="font-medium text-zinc-100">{disputes.total}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-400">Pending</span>
        <span className="font-medium text-amber-400">{disputes.pending}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-400">In Favor</span>
        <span className="font-medium text-green-400">{disputes.inFavor}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-400">Against</span>
        <span className="font-medium text-red-400">{disputes.against}</span>
      </div>
    </div>
  )
}

type ProfileTab = 'stats' | 'submissions'

export default function PublicProfilePage() {
  const { wallet } = useParams<{ wallet: string }>()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<ProfileTab>('stats')
  const [submissions, setSubmissions] = useState<UserSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionsPage, setSubmissionsPage] = useState(1)
  const [submissionsTotalPages, setSubmissionsTotalPages] = useState(1)
  const [submissionsFetched, setSubmissionsFetched] = useState(false)

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

  useEffect(() => {
    if (activeTab !== 'submissions' || !wallet) return

    const fetchSubmissions = async () => {
      setSubmissionsLoading(true)
      try {
        const res = await fetch(`/api/users/${wallet}/submissions?page=${submissionsPage}&limit=20`)
        const data = await res.json()
        if (data.success) {
          setSubmissions(data.submissions)
          setSubmissionsTotalPages(data.pagination?.pages || 1)
          setSubmissionsFetched(true)
        }
      } catch {
        // ignore
      } finally {
        setSubmissionsLoading(false)
      }
    }

    fetchSubmissions()
  }, [activeTab, wallet, submissionsPage])

  const copyWallet = () => {
    navigator.clipboard.writeText(wallet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-20 w-20 animate-pulse rounded-full bg-surface mb-4" />
        <div className="h-8 w-64 animate-pulse rounded bg-surface mb-4" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="mx-auto max-w-4xl text-center py-16">
        <h1 className="text-2xl font-bold text-white mb-2">Profile Not Found</h1>
        <p className="text-zinc-500 mb-6">{error || 'This user has not joined the platform yet.'}</p>
        <Link
          href="/tasks"
          className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover"
        >
          Browse Campaigns
        </Link>
      </div>
    )
  }

  const { user, asClient, asWorker } = stats

  return (
    <div className="mx-auto max-w-4xl">
      {/* Profile Header */}
      <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {user.profilePicUrl ? (
          <img
            src={user.profilePicUrl}
            alt=""
            className="h-20 w-20 sm:h-[100px] sm:w-[100px] rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="flex h-20 w-20 sm:h-[100px] sm:w-[100px] items-center justify-center rounded-full bg-zinc-800 text-2xl font-bold text-zinc-300 shrink-0">
            {user.walletAddress.slice(0, 2)}
          </div>
        )}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          {user.username && (
            <h1 className="text-xl font-bold text-white mb-1">
              {user.username}
            </h1>
          )}
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
            <p className={`${user.username ? 'text-sm text-zinc-400' : 'text-xl font-bold text-white'} font-mono truncate`}>
              {user.walletAddress.slice(0, 8)}...{user.walletAddress.slice(-6)}
            </p>
            <button
              onClick={copyWallet}
              className="shrink-0 rounded-full border border-k-border px-2 py-0.5 text-xs font-medium text-zinc-400 transition hover:border-k-border-hover hover:bg-surface"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-zinc-400">
            Member since {new Date(user.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="mb-6 flex gap-2 border-b border-k-border">
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'stats'
              ? 'border-accent text-accent'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Stats
        </button>
        <button
          onClick={() => setActiveTab('submissions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'submissions'
              ? 'border-accent text-accent'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Submissions {submissionsFetched && `(${submissions.length > 0 ? submissions.length + (submissionsTotalPages > 1 ? '+' : '') : 0})`}
        </button>
      </div>

      {/* Submissions Tab */}
      {activeTab === 'submissions' && (
        <section>
          {submissionsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-surface" />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-k-border p-8 text-center border-k-border">
              <p className="text-zinc-500">No submissions yet.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {submissions.map((sub) => (
                  <Link
                    key={sub.id}
                    href={`/tasks/${sub.task.id}`}
                    className="block rounded-xl border border-k-border p-4 transition-colors hover:border-k-border-hover"
                  >
                    {/* Top row: task title + outcome badge */}
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-zinc-100 truncate">
                          {sub.task.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            sub.task.taskType === 'COMPETITION'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {sub.task.taskType === 'COMPETITION' ? 'Competition' : 'Quote'}
                          </span>
                          <span className="text-xs text-zinc-400">
                            Budget: {formatSol(sub.task.budgetLamports)}
                          </span>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        sub.outcome === 'won'
                          ? 'bg-green-500/20 text-green-400'
                          : sub.outcome === 'lost'
                            ? 'bg-red-500/20 text-red-400'
                            : sub.outcome === 'in_progress'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-zinc-700/50 text-zinc-400'
                      }`}>
                        {sub.outcome === 'won' ? 'Won' : sub.outcome === 'lost' ? 'Not Selected' : sub.outcome === 'in_progress' ? 'In Progress' : 'Pending'}
                      </span>
                    </div>

                    {/* Submission description preview */}
                    <p className="mb-2 text-sm text-zinc-400 line-clamp-2">
                      {sub.description}
                    </p>

                    {/* Attachments */}
                    {sub.attachments && sub.attachments.length > 0 && (
                      <div className="mb-2">
                        <p className="mb-1.5 text-xs font-medium text-zinc-500">
                          Attachments ({sub.attachments.length})
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" onClick={(e) => e.preventDefault()}>
                          {sub.attachments.map((att: any, i: number) => (
                            <a
                              key={i}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="group block overflow-hidden rounded-lg border border-k-border"
                            >
                              {att.contentType?.startsWith('image/') ? (
                                <img src={att.url} alt={att.filename || ''} className="h-32 w-full object-cover" />
                              ) : att.contentType?.startsWith('video/') ? (
                                <video src={att.url} className="h-32 w-full object-cover" />
                              ) : (
                                <div className="flex h-32 items-center justify-center bg-surface">
                                  <span className="text-xs text-zinc-500">{att.filename || 'File'}</span>
                                </div>
                              )}
                              <div className="px-2 py-1.5">
                                <p className="truncate text-xs text-zinc-400 group-hover:text-zinc-200">
                                  {att.filename || 'Download'}
                                </p>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bottom row: bid amount, payout, date */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-4">
                        <span className="text-zinc-400">
                          Bid: <span className="font-semibold text-zinc-100">{formatSol(sub.bid.amountLamports)}</span>
                        </span>
                        {sub.payout.paid && (
                          <span className="text-green-400">
                            Paid: <span className="font-semibold">{formatSol(sub.payout.payoutLamports)}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-400">
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Creator info */}
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                      <span>Posted by</span>
                      {sub.task.creatorProfilePic ? (
                        <img src={sub.task.creatorProfilePic} alt="" className="h-4 w-4 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[8px] font-medium text-zinc-300">
                          {sub.task.creatorWallet.slice(0, 2)}
                        </div>
                      )}
                      <span>{sub.task.creatorUsername || `${sub.task.creatorWallet.slice(0, 4)}...${sub.task.creatorWallet.slice(-4)}`}</span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {submissionsTotalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setSubmissionsPage((p) => Math.max(1, p - 1))}
                    disabled={submissionsPage === 1}
                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 border-k-border"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-zinc-500">
                    Page {submissionsPage} of {submissionsTotalPages}
                  </span>
                  <button
                    onClick={() => setSubmissionsPage((p) => Math.min(submissionsTotalPages, p + 1))}
                    disabled={submissionsPage === submissionsTotalPages}
                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 border-k-border"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Stats Tab - As Client Section */}
      {activeTab === 'stats' && <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4">
          As Campaign Poster
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
          <StatCard
            label="Campaigns Posted"
            value={asClient.totalTasksPosted}
            subValue={`Total value: ${formatSol(asClient.totalTaskBudgetLamports)}`}
          />
          <StatCard
            label="Campaigns Completed"
            value={asClient.tasksCompleted}
          />
          <StatCard
            label="Amount Paid Out"
            value={formatSol(asClient.amountPaidOutLamports)}
          />
        </div>

        {/* Task Status Breakdown */}
        <div className="rounded-xl border border-k-border p-4 mb-4">
          <h3 className="text-sm font-medium text-white mb-3">Campaign Status Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-zinc-400">Open</p>
              <p className="font-semibold text-green-400">{asClient.tasksOpen}</p>
            </div>
            <div>
              <p className="text-zinc-400">In Progress</p>
              <p className="font-semibold text-blue-400">{asClient.tasksInProgress}</p>
            </div>
            <div>
              <p className="text-zinc-400">Completed</p>
              <p className="font-semibold text-zinc-400">{asClient.tasksCompleted}</p>
            </div>
            <div>
              <p className="text-zinc-400">Disputed</p>
              <p className="font-semibold text-red-400">{asClient.tasksDisputed}</p>
            </div>
            <div>
              <p className="text-zinc-400">Cancelled</p>
              <p className="font-semibold text-zinc-500">{asClient.tasksCancelled}</p>
            </div>
          </div>
        </div>

        {/* Disputes as Client */}
        <div className="rounded-xl border border-k-border p-4">
          <h3 className="text-sm font-medium text-white mb-3">Disputes (as Campaign Poster)</h3>
          <DisputeStats disputes={asClient.disputes} />
        </div>
      </section>}

      {/* As Worker Section */}
      {activeTab === 'stats' && <section>
        <h2 className="text-lg font-semibold text-white mb-4">
          As Worker
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
          <StatCard
            label="Bids Placed"
            value={asWorker.totalBidsPlaced}
            subValue={`Total value: ${formatSol(asWorker.totalBidValueLamports)}`}
          />
          <StatCard
            label="Campaigns Won"
            value={asWorker.tasksWon}
          />
          <StatCard
            label="Amount Received"
            value={formatSol(asWorker.amountReceivedLamports)}
          />
        </div>

        {/* Bid Status Breakdown */}
        <div className="rounded-xl border border-k-border p-4 mb-4">
          <h3 className="text-sm font-medium text-white mb-3">Work Status Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-zinc-400">Campaigns Won</p>
              <p className="font-semibold text-green-400">{asWorker.tasksWon}</p>
            </div>
            <div>
              <p className="text-zinc-400">In Progress</p>
              <p className="font-semibold text-blue-400">{asWorker.tasksInProgress}</p>
            </div>
            <div>
              <p className="text-zinc-400">Completed</p>
              <p className="font-semibold text-zinc-400">{asWorker.tasksCompleted}</p>
            </div>
            <div>
              <p className="text-zinc-400">Disputed</p>
              <p className="font-semibold text-red-400">{asWorker.tasksDisputed}</p>
            </div>
          </div>
        </div>

        {/* Disputes as Worker */}
        <div className="rounded-xl border border-k-border p-4">
          <h3 className="text-sm font-medium text-white mb-3">Disputes (as Worker)</h3>
          <DisputeStats disputes={asWorker.disputes} />
        </div>
      </section>}
    </div>
  )
}
