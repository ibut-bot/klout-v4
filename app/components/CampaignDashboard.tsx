'use client'

import { useEffect, useState, useCallback } from 'react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import CampaignPayButton from './CampaignPayButton'
import CampaignRejectButton from './CampaignRejectButton'
import { type PaymentTokenType, type TokenInfo, formatTokenAmount, resolveTokenInfo } from '@/lib/token-utils'

interface CampaignStats {
  totalBudgetLamports: string
  budgetRemainingLamports: string
  budgetAllocatedLamports: string
  budgetSpentLamports: string
  cpmLamports: string
  minViews: number
  minPayoutLamports: string
  totalSubmissions: number
  approved: number
  paymentRequested: number
  paid: number
  rejected: number
  pending: number
  totalViews: number
  myApprovedPayoutLamports: string
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
  submitterId: string
  submitter: {
    id: string
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
  refreshTrigger?: number
  paymentToken?: PaymentTokenType
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
}

function formatSol(lamports: string | number, decimals = 4): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0'
  if (sol < 0.001 && decimals >= 4) return sol.toPrecision(2)
  return sol.toFixed(decimals)
}

const STATUS_BADGE: Record<string, string> = {
  PENDING_PAYMENT: 'bg-yellow-500/20 text-yellow-400',
  READING_VIEWS: 'bg-blue-500/20 text-blue-400',
  CHECKING_CONTENT: 'bg-blue-500/20 text-blue-400',
  APPROVED: 'bg-green-500/20 text-green-400',
  PAYMENT_REQUESTED: 'bg-purple-500/20 text-purple-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  CREATOR_REJECTED: 'bg-orange-500/20 text-orange-400',
  PAID: 'bg-emerald-500/20 text-emerald-400',
  PAYMENT_FAILED: 'bg-red-500/20 text-red-400',
}

export default function CampaignDashboard({ taskId, multisigAddress, isCreator, refreshTrigger, paymentToken = 'SOL', customTokenMint, customTokenSymbol, customTokenDecimals }: Props) {
  const tInfo = resolveTokenInfo(paymentToken, customTokenMint, customTokenSymbol, customTokenDecimals)
  const sym = tInfo.symbol
  const { authFetch } = useAuth()
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [submissions, setSubmissions] = useState<CampaignSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectPreset, setRejectPreset] = useState<'Botting' | 'Quality' | 'Relevancy' | 'Other' | ''>('')
  const [rejectReason, setRejectReason] = useState('')
  const [rejectLoading, setRejectLoading] = useState(false)
  const [rejectError, setRejectError] = useState('')
  const [banSubmitter, setBanSubmitter] = useState(false)
  const [overrideApprovingId, setOverrideApprovingId] = useState<string | null>(null)
  const [overrideApproveLoading, setOverrideApproveLoading] = useState(false)
  const [overrideApproveError, setOverrideApproveError] = useState('')
  const [requestingPayment, setRequestingPayment] = useState(false)
  const [requestPaymentError, setRequestPaymentError] = useState('')
  const [requestPaymentSuccess, setRequestPaymentSuccess] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, subsRes] = await Promise.all([
        authFetch(`/api/tasks/${taskId}/campaign-stats`),
        authFetch(`/api/tasks/${taskId}/campaign-submissions?page=${page}&limit=50`),
      ])
      const [statsData, subsData] = await Promise.all([statsRes.json(), subsRes.json()])
      if (statsData.success) setStats(statsData.stats)
      if (subsData.success) {
        setSubmissions(subsData.submissions)
        if (subsData.pagination) {
          setTotalPages(subsData.pagination.pages)
          setTotalCount(subsData.pagination.total)
        }
      }
    } catch {}
    setLoading(false)
  }, [taskId, authFetch, page])

  const handleReject = async (submissionId: string) => {
    if (!rejectPreset) {
      setRejectError('Please select a reason for rejection')
      return
    }
    if (rejectPreset === 'Other' && !rejectReason.trim()) {
      setRejectError('Please enter a reason')
      return
    }
    const finalReason = rejectPreset === 'Other' ? rejectReason.trim() : rejectPreset
    setRejectLoading(true)
    setRejectError('')
    try {
      const res = await authFetch(`/api/tasks/${taskId}/campaign-submissions/${submissionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectPreset, ...(rejectPreset === 'Other' ? { customReason: rejectReason.trim() } : {}), banSubmitter }),
      })
      const data = await res.json()
      if (!data.success) {
        setRejectError(data.message || 'Failed to reject submission')
      } else {
        setRejectingId(null)
        setRejectPreset('')
        setRejectReason('')
        setBanSubmitter(false)
        fetchData()
      }
    } catch {
      setRejectError('Network error')
    }
    setRejectLoading(false)
  }

  const handleOverrideApprove = async (submissionId: string) => {
    setOverrideApproveLoading(true)
    setOverrideApproveError('')
    try {
      const res = await authFetch(`/api/tasks/${taskId}/campaign-submissions/${submissionId}/override-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!data.success) {
        setOverrideApproveError(data.message || 'Failed to approve submission')
      } else {
        setOverrideApprovingId(null)
        fetchData()
      }
    } catch {
      setOverrideApproveError('Network error')
    }
    setOverrideApproveLoading(false)
  }

  const handleRequestPayment = async () => {
    setRequestingPayment(true)
    setRequestPaymentError('')
    setRequestPaymentSuccess('')
    try {
      const res = await authFetch(`/api/tasks/${taskId}/campaign-request-payment`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!data.success) {
        setRequestPaymentError(data.message || 'Payment request failed')
      } else {
        setRequestPaymentSuccess(`Payment requested for ${data.submissionCount} post(s) — ${formatTokenAmount(data.totalPayoutLamports, tInfo)} ${sym}`)
        fetchData()
      }
    } catch {
      setRequestPaymentError('Network error')
    }
    setRequestingPayment(false)
  }

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshTrigger])

  if (loading) {
    return <div className="animate-pulse rounded-xl border border-zinc-200 p-6 border-k-border h-48" />
  }

  if (!stats) return null

  const budgetPct = Number(stats.totalBudgetLamports) > 0
    ? ((Number(stats.totalBudgetLamports) - Number(stats.budgetRemainingLamports)) / Number(stats.totalBudgetLamports)) * 100
    : 0

  const myApprovedPayout = Number(stats.myApprovedPayoutLamports || '0')
  const budgetRemaining = Number(stats.budgetRemainingLamports || '0')
  const cappedPayout = Math.min(myApprovedPayout, budgetRemaining)
  const minPayoutThreshold = Number(stats.minPayoutLamports || '0')
  const canRequestPayment = !isCreator && cappedPayout > 0 && (minPayoutThreshold === 0 || myApprovedPayout >= minPayoutThreshold)

  return (
    <div className="space-y-6">
      {/* Stats Cards — creator only */}
      {isCreator && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">Total Budget</p>
            <p className="text-lg font-semibold text-zinc-100">{formatTokenAmount(stats.totalBudgetLamports, tInfo, 0)} {sym}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">Remaining</p>
            <p className="text-lg font-semibold text-zinc-100">{formatTokenAmount(stats.budgetRemainingLamports, tInfo, 0)} {sym}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">Total Views</p>
            <p className="text-lg font-semibold text-zinc-100">{stats.totalViews.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">Submissions</p>
            <p className="text-lg font-semibold text-zinc-100">{stats.totalSubmissions}</p>
            <p className="text-xs text-zinc-400">{stats.approved} approved, {stats.paymentRequested} pending pay, {stats.paid} paid, {stats.rejected} rejected</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">CPM (per 1,000 views)</p>
            <p className="text-lg font-semibold text-zinc-100">{formatTokenAmount(stats.cpmLamports, tInfo, 2)} {sym}</p>
          </div>
          {stats.minViews > 0 && (
            <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
              <p className="text-xs text-zinc-500">Min views per post</p>
              <p className="text-lg font-semibold text-zinc-100">{stats.minViews.toLocaleString()}</p>
            </div>
          )}
          {Number(stats.minPayoutLamports) > 0 && (
            <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
              <p className="text-xs text-zinc-500">Min payout threshold</p>
              <p className="text-lg font-semibold text-zinc-100">{formatTokenAmount(stats.minPayoutLamports, tInfo, 2)} {sym}</p>
            </div>
          )}
        </div>
      )}

      {/* Budget Progress Bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          <span>Budget used: {budgetPct.toFixed(1)}%</span>
          <span>CPM: {formatTokenAmount(stats.cpmLamports, tInfo, 2)} {sym}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-700 bg-surface">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${Math.min(budgetPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Request Payment section (for non-creators) */}
      {!isCreator && (
        <div className="rounded-xl border border-k-border p-4">
          <h3 className="mb-2 text-sm font-semibold text-white">Your Payout</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Approved (unpaid):</span>
              <span className="font-medium text-zinc-100">
                {formatTokenAmount(myApprovedPayout, tInfo)} {sym}
                {myApprovedPayout > 0 && cappedPayout < myApprovedPayout && (
                  <span className="text-amber-400"> (capped to {formatTokenAmount(cappedPayout, tInfo)} {sym})</span>
                )}
              </span>
            </div>
            {minPayoutThreshold > 0 && (
              <div className="flex justify-between text-zinc-400">
                <span>Min payout threshold:</span>
                <span className="font-medium text-zinc-100">{formatTokenAmount(minPayoutThreshold, tInfo)} {sym}</span>
              </div>
            )}
            {minPayoutThreshold > 0 && myApprovedPayout > 0 && myApprovedPayout < minPayoutThreshold && (
              <div className="mt-1">
                <div className="mb-1 text-xs text-zinc-500">Progress to threshold: {((myApprovedPayout / minPayoutThreshold) * 100).toFixed(1)}%</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all"
                    style={{ width: `${Math.min((myApprovedPayout / minPayoutThreshold) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
            {requestPaymentError && (
              <p className="text-xs text-red-400">{requestPaymentError}</p>
            )}
            {requestPaymentSuccess && (
              <p className="text-xs text-green-400">{requestPaymentSuccess}</p>
            )}
            <button
              onClick={handleRequestPayment}
              disabled={!canRequestPayment || requestingPayment}
              className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-50"
            >
              {requestingPayment
                ? 'Requesting...'
                : canRequestPayment
                  ? `Request Payment (${formatTokenAmount(cappedPayout, tInfo)} ${sym})`
                  : myApprovedPayout > 0
                    ? `Below threshold (${formatTokenAmount(myApprovedPayout, tInfo)} / ${formatTokenAmount(minPayoutThreshold, tInfo)} ${sym})`
                    : 'No approved payouts yet'}
            </button>
          </div>
        </div>
      )}

      {/* Submissions Table */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-white">Submissions ({totalCount})</h3>
        {submissions.length === 0 ? (
          <p className="text-sm text-zinc-500">No submissions yet.</p>
        ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-k-border">
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Submitter</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Post</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Views</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Payout</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Platform Fee (10%)</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Status</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Date</th>
                  {isCreator && <th className="pb-2 font-medium text-zinc-500">Action</th>}
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-k-border border-k-border/50">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {s.submitter.profilePicUrl ? (
                          <img src={s.submitter.profilePicUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-medium text-zinc-400 bg-zinc-700 text-zinc-300">
                            {s.submitter.walletAddress.slice(0, 2)}
                          </div>
                        )}
                        <span className="text-zinc-300">
                          {s.submitter.xUsername ? `@${s.submitter.xUsername}` : s.submitter.username || `${s.submitter.walletAddress.slice(0, 6)}...`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <a href={s.postUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover text-blue-400">
                        View Post
                      </a>
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {s.viewCount !== null ? s.viewCount.toLocaleString() : '-'}
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {s.payoutLamports ? `${formatTokenAmount(s.payoutLamports, tInfo)} ${sym}` : '-'}
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {s.payoutLamports ? `${formatTokenAmount(Math.round(Number(s.payoutLamports) * 0.1), tInfo)} ${sym}` : '-'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] || ''}`}>
                        {s.status.replace(/_/g, ' ')}
                      </span>
                      {(s.status === 'REJECTED' || s.status === 'CREATOR_REJECTED') && s.rejectionReason && (
                        <p className={`mt-0.5 text-xs ${s.status === 'CREATOR_REJECTED' ? 'text-orange-400' : 'text-red-500'}`} title={s.rejectionReason}>
                          {s.status === 'CREATOR_REJECTED' ? 'Creator: ' : ''}
                          {s.rejectionReason.length > 50 ? s.rejectionReason.slice(0, 50) + '...' : s.rejectionReason}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-zinc-400">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    {isCreator && (
                      <td className="py-3">
                        {s.status === 'PAYMENT_REQUESTED' && s.payoutLamports && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <CampaignPayButton
                                taskId={taskId}
                                submissionId={s.id}
                                multisigAddress={multisigAddress}
                                recipientWallet={s.submitter.walletAddress}
                                payoutLamports={s.payoutLamports}
                                onPaid={fetchData}
                                paymentToken={paymentToken}
                                customTokenMint={customTokenMint}
                                customTokenSymbol={customTokenSymbol}
                                customTokenDecimals={customTokenDecimals}
                                submitterId={s.submitterId}
                              />
                              <button
                                onClick={() => { setRejectingId(s.id); setRejectPreset(''); setRejectReason(''); setRejectError(''); setBanSubmitter(false) }}
                                className="rounded-md border border-red-500/30 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                            {rejectingId === s.id && (
                              <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 p-2">
                                <select
                                  value={rejectPreset}
                                  onChange={(e) => { setRejectPreset(e.target.value as any); setRejectError('') }}
                                  className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-red-500 focus:outline-none"
                                >
                                  <option value="">Select reason...</option>
                                  <option value="Botting">Botting</option>
                                  <option value="Quality">Quality</option>
                                  <option value="Relevancy">Relevancy</option>
                                  <option value="Other">Other</option>
                                </select>
                                {rejectPreset === 'Other' && (
                                  <input
                                    type="text"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Enter rejection reason..."
                                    className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
                                    maxLength={500}
                                  />
                                )}
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={banSubmitter}
                                    onChange={(e) => setBanSubmitter(e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500"
                                  />
                                  <span className="text-xs text-zinc-400">Ban from all your future campaigns</span>
                                </label>
                                {rejectError && <p className="text-xs text-red-500">{rejectError}</p>}
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleReject(s.id)}
                                    disabled={rejectLoading || !rejectPreset || (rejectPreset === 'Other' && !rejectReason.trim())}
                                    className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {rejectLoading ? (banSubmitter ? 'Rejecting & Banning...' : 'Rejecting...') : (banSubmitter ? 'Reject & Ban' : 'Confirm Reject')}
                                  </button>
                                  <button
                                    onClick={() => { setRejectingId(null); setRejectPreset(''); setBanSubmitter(false) }}
                                    className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {(s.status === 'APPROVED') && s.payoutLamports && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">Awaiting payment request</span>
                            <button
                              onClick={() => { setRejectingId(s.id); setRejectPreset(''); setRejectReason(''); setRejectError(''); setBanSubmitter(false) }}
                              className="rounded-md border border-red-500/30 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              Reject
                            </button>
                            {rejectingId === s.id && (
                              <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 p-2">
                                <select
                                  value={rejectPreset}
                                  onChange={(e) => { setRejectPreset(e.target.value as any); setRejectError('') }}
                                  className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-red-500 focus:outline-none"
                                >
                                  <option value="">Select reason...</option>
                                  <option value="Botting">Botting</option>
                                  <option value="Quality">Quality</option>
                                  <option value="Relevancy">Relevancy</option>
                                  <option value="Other">Other</option>
                                </select>
                                {rejectPreset === 'Other' && (
                                  <input
                                    type="text"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Enter rejection reason..."
                                    className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
                                    maxLength={500}
                                  />
                                )}
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={banSubmitter}
                                    onChange={(e) => setBanSubmitter(e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500"
                                  />
                                  <span className="text-xs text-zinc-400">Ban from all your future campaigns</span>
                                </label>
                                {rejectError && <p className="text-xs text-red-500">{rejectError}</p>}
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleReject(s.id)}
                                    disabled={rejectLoading || !rejectPreset || (rejectPreset === 'Other' && !rejectReason.trim())}
                                    className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {rejectLoading ? (banSubmitter ? 'Rejecting & Banning...' : 'Rejecting...') : (banSubmitter ? 'Reject & Ban' : 'Confirm Reject')}
                                  </button>
                                  <button
                                    onClick={() => { setRejectingId(null); setRejectPreset(''); setBanSubmitter(false) }}
                                    className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {s.status === 'PAID' && s.paymentTxSig && (
                          <span className="text-xs text-emerald-600">Paid</span>
                        )}
                        {s.status === 'CREATOR_REJECTED' && (
                          <span className="text-xs text-orange-400">Rejected by you</span>
                        )}
                        {s.status === 'REJECTED' && (
                          <div className="flex flex-col gap-1.5">
                            {overrideApprovingId === s.id ? (
                              <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 p-2">
                                <p className="text-xs text-zinc-400">Override auto-rejection and approve this submission?</p>
                                {overrideApproveError && <p className="text-xs text-red-500">{overrideApproveError}</p>}
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleOverrideApprove(s.id)}
                                    disabled={overrideApproveLoading}
                                    className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                  >
                                    {overrideApproveLoading ? 'Approving...' : 'Confirm Approve'}
                                  </button>
                                  <button
                                    onClick={() => { setOverrideApprovingId(null); setOverrideApproveError('') }}
                                    className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setOverrideApprovingId(s.id); setOverrideApproveError('') }}
                                className="rounded-md border border-green-500/30 px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-500/10 transition-colors"
                              >
                                Override &amp; Approve
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Page {page} of {totalPages} ({totalCount} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-k-border px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-surface disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-k-border px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-surface disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
        )}
      </div>
    </div>
  )
}
