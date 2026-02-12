'use client'

import { useEffect, useState, useCallback } from 'react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import CampaignPayButton from './CampaignPayButton'

interface CampaignStats {
  totalBudgetLamports: string
  budgetRemainingLamports: string
  budgetAllocatedLamports: string
  budgetSpentLamports: string
  cpmLamports: string
  minViews: number
  totalSubmissions: number
  approved: number
  paid: number
  rejected: number
  pending: number
  totalViews: number
}

interface CampaignSubmission {
  id: string
  postUrl: string
  xPostId: string
  viewCount: number | null
  viewsReadAt: string | null
  payoutLamports: string | null
  status: string
  rejectionReason: string | null
  contentCheckPassed: boolean | null
  contentCheckExplanation: string | null
  paymentTxSig: string | null
  submitter: {
    walletAddress: string
    username: string | null
    xUsername: string | null
    profilePicUrl: string | null
  }
  createdAt: string
}

interface Props {
  taskId: string
  multisigAddress: string
  isCreator: boolean
}

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0'
  if (sol < 0.001) return sol.toPrecision(2)
  return sol.toFixed(4)
}

const STATUS_BADGE: Record<string, string> = {
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  READING_VIEWS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  CHECKING_CONTENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  PAYMENT_FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export default function CampaignDashboard({ taskId, multisigAddress, isCreator }: Props) {
  const { authFetch } = useAuth()
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [submissions, setSubmissions] = useState<CampaignSubmission[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, subsRes] = await Promise.all([
        authFetch(`/api/tasks/${taskId}/campaign-stats`),
        authFetch(`/api/tasks/${taskId}/campaign-submissions`),
      ])
      const [statsData, subsData] = await Promise.all([statsRes.json(), subsRes.json()])
      if (statsData.success) setStats(statsData.stats)
      if (subsData.success) setSubmissions(subsData.submissions)
    } catch {}
    setLoading(false)
  }, [taskId, authFetch])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <div className="animate-pulse rounded-xl border border-zinc-200 p-6 dark:border-zinc-800 h-48" />
  }

  if (!stats) return null

  const budgetPct = Number(stats.totalBudgetLamports) > 0
    ? ((Number(stats.totalBudgetLamports) - Number(stats.budgetRemainingLamports)) / Number(stats.totalBudgetLamports)) * 100
    : 0

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Total Budget</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{formatSol(stats.totalBudgetLamports)} SOL</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Remaining</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{formatSol(stats.budgetRemainingLamports)} SOL</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Total Views</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stats.totalViews.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Submissions</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stats.totalSubmissions}</p>
          <p className="text-xs text-zinc-400">{stats.approved} approved, {stats.paid} paid, {stats.rejected} rejected</p>
        </div>
      </div>

      {/* Budget Progress Bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          <span>Budget used: {budgetPct.toFixed(1)}%</span>
          <span>CPM: {formatSol(stats.cpmLamports)} SOL</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${Math.min(budgetPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Submissions Table */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Submissions</h3>
        {submissions.length === 0 ? (
          <p className="text-sm text-zinc-500">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Submitter</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Post</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Views</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Payout</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Status</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Date</th>
                  {isCreator && <th className="pb-2 font-medium text-zinc-500">Action</th>}
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {s.submitter.profilePicUrl ? (
                          <img src={s.submitter.profilePicUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                            {s.submitter.walletAddress.slice(0, 2)}
                          </div>
                        )}
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {s.submitter.xUsername ? `@${s.submitter.xUsername}` : s.submitter.username || `${s.submitter.walletAddress.slice(0, 6)}...`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <a href={s.postUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
                        View Post
                      </a>
                    </td>
                    <td className="py-3 pr-4 text-zinc-700 dark:text-zinc-300">
                      {s.viewCount !== null ? s.viewCount.toLocaleString() : '-'}
                    </td>
                    <td className="py-3 pr-4 text-zinc-700 dark:text-zinc-300">
                      {s.payoutLamports ? `${formatSol(s.payoutLamports)} SOL` : '-'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] || ''}`}>
                        {s.status.replace('_', ' ')}
                      </span>
                      {s.status === 'REJECTED' && s.rejectionReason && (
                        <p className="mt-0.5 text-xs text-red-500" title={s.rejectionReason}>
                          {s.rejectionReason.length > 50 ? s.rejectionReason.slice(0, 50) + '...' : s.rejectionReason}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-zinc-400">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    {isCreator && (
                      <td className="py-3">
                        {s.status === 'APPROVED' && s.payoutLamports && (
                          <CampaignPayButton
                            taskId={taskId}
                            submissionId={s.id}
                            multisigAddress={multisigAddress}
                            recipientWallet={s.submitter.walletAddress}
                            payoutLamports={s.payoutLamports}
                            onPaid={fetchData}
                          />
                        )}
                        {s.status === 'PAID' && s.paymentTxSig && (
                          <span className="text-xs text-emerald-600">Paid</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
