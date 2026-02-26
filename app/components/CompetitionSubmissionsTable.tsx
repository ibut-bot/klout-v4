'use client'

import { useState, useMemo } from 'react'
import { extractXPostUrl, extractTweetId } from './XPostEmbed'
import SelectWinnerButton, { type WinnerBid } from './SelectWinnerButton'
import { formatTokenAmount, resolveTokenInfo, type PaymentTokenType } from '@/lib/token-utils'

interface Bid {
  id: string
  bidderId: string
  bidderWallet: string
  bidderUsername?: string | null
  bidderProfilePic?: string | null
  amountLamports: string
  status: string
  winnerPlace?: number | null
}

interface SubmissionRow {
  id: string
  bidId: string
  description: string
  postUrl?: string | null
  xPostId?: string | null
  viewCount?: number | null
  likeCount?: number | null
  retweetCount?: number | null
  commentCount?: number | null
  createdAt: string
  bid?: any
}

type SortCol = 'submitter' | 'views' | 'likes' | 'retweets' | 'date'
type SortDir = 'asc' | 'desc'

interface CompetitionSubmissionsTableProps {
  submissions: SubmissionRow[]
  bids: Bid[]
  task: {
    id: string
    taskType: string
    status: string
    maxWinners?: number
    budgetLamports: string
    prizeStructure?: { place: number; amountLamports: string }[] | null
    multisigAddress?: string | null
    paymentToken?: string
    customTokenMint?: string | null
    customTokenSymbol?: string | null
    customTokenDecimals?: number | null
  }
  isCreator: boolean
  onRefresh: () => void
  onSelectBidder?: (bidderId: string) => void
  onSelectSubmission?: (submissionId: string) => void
}

const PLACE_LABELS = ['1st', '2nd', '3rd']
function placeLabel(p: number) {
  return p <= 3 ? PLACE_LABELS[p - 1] : `${p}th`
}

function resolvePostInfo(sub: SubmissionRow) {
  if (sub.postUrl && sub.xPostId) return { url: sub.postUrl, id: sub.xPostId }
  const fallbackUrl = extractXPostUrl(sub.description || '')
  if (fallbackUrl) {
    const fallbackId = extractTweetId(fallbackUrl)
    return { url: fallbackUrl, id: fallbackId }
  }
  return null
}

export default function CompetitionSubmissionsTable({
  submissions,
  bids,
  task,
  isCreator,
  onRefresh,
  onSelectBidder,
  onSelectSubmission,
}: CompetitionSubmissionsTableProps) {
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [openPickId, setOpenPickId] = useState<string | null>(null)
  const [rejectingBidId, setRejectingBidId] = useState<string | null>(null)

  const pt = (task.paymentToken as PaymentTokenType) || 'SOL'
  const tInfo = resolveTokenInfo(pt, task.customTokenMint, task.customTokenSymbol, task.customTokenDecimals)

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const maxW = task.maxWinners || 1
  const awardedPlaces = bids.filter(b => b.winnerPlace != null).map(b => b.winnerPlace!)
  const openPlaces = Array.from({ length: maxW }, (_, i) => i + 1).filter(p => !awardedPlaces.includes(p))

  const canAwardWinners = isCreator
    && (maxW > 1 ? ['OPEN', 'IN_PROGRESS'].includes(task.status) : task.status === 'OPEN')
    && openPlaces.length > 0

  const prizeForPlace = (place: number) => {
    if (task.prizeStructure && Array.isArray(task.prizeStructure)) {
      const entry = task.prizeStructure.find(p => p.place === place)
      return entry?.amountLamports
    }
    return task.budgetLamports
  }

  const handleReject = async (bidId: string) => {
    setRejectingBidId(bidId)
    try {
      const res = await fetch(`/api/tasks/${task.id}/bids/${bidId}/reject`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      onRefresh()
    } catch (err: any) {
      console.error('Reject failed:', err)
    } finally {
      setRejectingBidId(null)
    }
  }

  const sorted = useMemo(() => {
    const rows = [...submissions]
    rows.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'submitter':
          cmp = (a.bid?.bidderUsername || a.bid?.bidderWallet || '').localeCompare(b.bid?.bidderUsername || b.bid?.bidderWallet || '')
          break
        case 'views':
          cmp = (a.viewCount ?? 0) - (b.viewCount ?? 0)
          break
        case 'likes':
          cmp = (a.likeCount ?? 0) - (b.likeCount ?? 0)
          break
        case 'retweets':
          cmp = (a.retweetCount ?? 0) - (b.retweetCount ?? 0)
          break
        case 'date':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [submissions, sortCol, sortDir])

  const SortHeader = ({ col, children, className }: { col: SortCol; children: React.ReactNode; className?: string }) => (
    <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 ${className || ''}`}>
      <button
        onClick={() => toggleSort(col)}
        className="inline-flex cursor-pointer select-none items-center gap-1 hover:text-zinc-300 transition-colors"
      >
        {children}
        {sortCol === col ? (
          <svg className="h-3 w-3 text-accent" viewBox="0 0 12 12" fill="currentColor">
            {sortDir === 'asc' ? <path d="M6 2l4 5H2z" /> : <path d="M6 10l4-5H2z" />}
          </svg>
        ) : (
          <svg className="h-3 w-3 opacity-30" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 2l3 4H3zM6 10l3-4H3z" />
          </svg>
        )}
      </button>
    </th>
  )

  const relTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  if (submissions.length === 0) return null

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-sm font-semibold text-white">
        All Entries ({submissions.length})
      </h3>
      <div className="overflow-visible rounded-xl border border-k-border bg-surface">
        <table className="w-full">
          <thead>
            <tr className="border-b border-k-border bg-zinc-900/40">
              <SortHeader col="submitter">Submitter</SortHeader>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Post</th>
              <SortHeader col="views">Views</SortHeader>
              <SortHeader col="likes">Likes</SortHeader>
              <SortHeader col="retweets">Retweets</SortHeader>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Status</th>
              <SortHeader col="date">Submitted</SortHeader>
              {(canAwardWinners || isCreator) && (
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">Action</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-k-border/50">
            {sorted.map((sub) => {
              const bid = sub.bid
              if (!bid) return null
              const matchedBid = bids.find(b => b.id === bid.id)
              const winPlace = matchedBid?.winnerPlace
              const bidStatus = matchedBid?.status || bid.status
              const postInfo = resolvePostInfo(sub)
              const showAction = canAwardWinners && bidStatus === 'PENDING'
              const showReject = isCreator && bidStatus === 'PENDING' && ['OPEN', 'IN_PROGRESS'].includes(task.status)
              const isPickOpen = openPickId === sub.id

              return (
                <tr
                  key={sub.id}
                  className="hover:bg-surface-hover transition-colors cursor-pointer"
                  onClick={() => { onSelectBidder?.(bid.bidderId); onSelectSubmission?.(sub.id) }}
                >
                  {/* Submitter */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {bid.bidderProfilePic ? (
                        <img src={bid.bidderProfilePic} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-k-border" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-400 ring-1 ring-k-border">
                          {(bid.bidderUsername || bid.bidderWallet || '??').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {bid.bidderUsername || `${(bid.bidderWallet || '').slice(0, 4)}...${(bid.bidderWallet || '').slice(-4)}`}
                        </p>
                        {bid.bidderUsername && (
                          <p className="truncate text-[11px] text-zinc-500">
                            {(bid.bidderWallet || '').slice(0, 4)}...{(bid.bidderWallet || '').slice(-4)}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Post */}
                  <td className="px-4 py-3">
                    {postInfo ? (
                      <a
                        href={postInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        <span className="font-mono text-xs">{postInfo.id || 'View'}</span>
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-600">No post</span>
                    )}
                  </td>

                  {/* Metrics */}
                  <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">
                    {sub.viewCount != null ? sub.viewCount.toLocaleString() : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">
                    {sub.likeCount != null ? sub.likeCount.toLocaleString() : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">
                    {sub.retweetCount != null ? sub.retweetCount.toLocaleString() : <span className="text-zinc-600">—</span>}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    {winPlace ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-400">
                        🏆 {placeLabel(winPlace)}
                      </span>
                    ) : bidStatus === 'REJECTED' ? (
                      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400">
                        Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
                        Pending
                      </span>
                    )}
                  </td>

                  {/* Submitted */}
                  <td className="px-4 py-3 text-xs text-zinc-500" title={new Date(sub.createdAt).toLocaleString()}>
                    {relTime(sub.createdAt)}
                  </td>

                  {/* Action */}
                  {(canAwardWinners || isCreator) && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {showAction && matchedBid ? (
                          <div className="relative inline-block">
                            <button
                              onClick={() => setOpenPickId(isPickOpen ? null : sub.id)}
                              className="rounded-lg border border-green-600/40 bg-green-600/10 px-3 py-1.5 text-xs font-medium text-green-400 transition hover:bg-green-600/20"
                            >
                              Pick Winner ▾
                            </button>
                            {isPickOpen && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setOpenPickId(null)} />
                                <div className="absolute right-0 bottom-full z-50 mb-1 w-56 rounded-lg border border-k-border bg-zinc-900 py-1 shadow-xl">
                                  {openPlaces.map(place => {
                                    const prize = prizeForPlace(place) || task.budgetLamports
                                    const formatted = `${formatTokenAmount(prize, tInfo, 2)} ${tInfo.symbol}`
                                    return (
                                      <div key={place} className="px-1 py-0.5">
                                        <SelectWinnerButton
                                          bid={matchedBid as unknown as WinnerBid}
                                          taskId={task.id}
                                          taskType={task.taskType}
                                          taskMultisigAddress={task.multisigAddress}
                                          winnerPlace={place}
                                          prizeAmountLamports={prize}
                                          paymentToken={task.paymentToken}
                                          customTokenMint={task.customTokenMint}
                                          customTokenSymbol={task.customTokenSymbol}
                                          customTokenDecimals={task.customTokenDecimals}
                                          onDone={() => { setOpenPickId(null); onRefresh() }}
                                        />
                                      </div>
                                    )
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        ) : winPlace ? (
                          <span className="text-xs text-zinc-600">Awarded</span>
                        ) : null}
                        {showReject && matchedBid && (
                          <button
                            onClick={() => handleReject(matchedBid.id)}
                            disabled={rejectingBidId === matchedBid.id}
                            className="rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-600/20 disabled:opacity-50"
                          >
                            {rejectingBidId === matchedBid.id ? 'Rejecting…' : 'Reject'}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
