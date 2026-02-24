'use client'

import { useState, useMemo } from 'react'
import SelectWinnerButton, { type WinnerBid } from './SelectWinnerButton'

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
}

export default function CompetitionSubmissionsTable({
  submissions,
  bids,
  task,
  isCreator,
  onRefresh,
  onSelectBidder,
}: CompetitionSubmissionsTableProps) {
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const maxW = task.maxWinners || 1
  const isMultiWinner = maxW > 1
  const awardedPlaces = bids.filter(b => b.winnerPlace != null).map(b => b.winnerPlace!)
  const nextOpenPlace = isMultiWinner
    ? Array.from({ length: maxW }, (_, i) => i + 1).find(p => !awardedPlaces.includes(p))
    : awardedPlaces.includes(1) ? undefined : 1

  const canAwardWinners = isCreator
    && (isMultiWinner ? ['OPEN', 'IN_PROGRESS'].includes(task.status) : task.status === 'OPEN')
    && nextOpenPlace !== undefined

  const prizeForPlace = (place: number) => {
    if (task.prizeStructure && Array.isArray(task.prizeStructure)) {
      const entry = task.prizeStructure.find(p => p.place === place)
      return entry?.amountLamports
    }
    return task.budgetLamports
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

  const SortHeader = ({ col, children }: { col: SortCol; children: React.ReactNode }) => (
    <th className="pb-2 pr-4 font-medium text-zinc-500">
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
      <div className="overflow-x-auto rounded-lg border border-k-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-k-border">
              <SortHeader col="submitter">Submitter</SortHeader>
              <th className="pb-2 pr-4 font-medium text-zinc-500">Post</th>
              <SortHeader col="views">Views</SortHeader>
              <SortHeader col="likes">Likes</SortHeader>
              <SortHeader col="retweets">Retweets</SortHeader>
              <th className="pb-2 pr-4 font-medium text-zinc-500">Status</th>
              <SortHeader col="date">Submitted</SortHeader>
              {canAwardWinners && <th className="pb-2 font-medium text-zinc-500">Action</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((sub) => {
              const bid = sub.bid
              if (!bid) return null
              const matchedBid = bids.find(b => b.id === bid.id)
              const winPlace = matchedBid?.winnerPlace
              const bidStatus = matchedBid?.status || bid.status

              const statusLabel = winPlace
                ? `${winPlace <= 3 ? ['1st', '2nd', '3rd'][winPlace - 1] : `${winPlace}th`} Place`
                : bidStatus === 'REJECTED'
                  ? 'Rejected'
                  : 'Pending'
              const statusColor = winPlace
                ? 'text-green-400'
                : bidStatus === 'REJECTED'
                  ? 'text-red-400'
                  : 'text-amber-400'

              const showAction = canAwardWinners && bidStatus === 'PENDING'

              return (
                <tr
                  key={sub.id}
                  className="border-b border-k-border/50 last:border-0 hover:bg-surface-hover transition-colors cursor-pointer"
                  onClick={() => onSelectBidder?.(bid.bidderId)}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {bid.bidderProfilePic ? (
                        <img src={bid.bidderProfilePic} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-medium text-zinc-300">
                          {(bid.bidderWallet || '').slice(0, 2)}
                        </div>
                      )}
                      <span className="truncate text-xs text-zinc-200">
                        {bid.bidderUsername || `${(bid.bidderWallet || '').slice(0, 4)}...${(bid.bidderWallet || '').slice(-4)}`}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    {sub.postUrl ? (
                      <a
                        href={sub.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {sub.xPostId ? `...${sub.xPostId.slice(-8)}` : 'View Post'}
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-300">
                    {sub.viewCount != null ? sub.viewCount.toLocaleString() : '—'}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-300">
                    {sub.likeCount != null ? sub.likeCount.toLocaleString() : '—'}
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-300">
                    {sub.retweetCount != null ? sub.retweetCount.toLocaleString() : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-zinc-400" title={new Date(sub.createdAt).toLocaleString()}>
                    {relTime(sub.createdAt)}
                  </td>
                  {canAwardWinners && (
                    <td className="py-3" onClick={(e) => e.stopPropagation()}>
                      {showAction && matchedBid && (
                        isMultiWinner ? (
                          <div className="flex flex-wrap gap-1">
                            {Array.from({ length: maxW }, (_, i) => i + 1)
                              .filter(p => !awardedPlaces.includes(p))
                              .slice(0, 3)
                              .map(place => (
                                <SelectWinnerButton
                                  key={place}
                                  bid={matchedBid as unknown as WinnerBid}
                                  taskId={task.id}
                                  taskType={task.taskType}
                                  taskMultisigAddress={task.multisigAddress}
                                  winnerPlace={place}
                                  prizeAmountLamports={prizeForPlace(place) || task.budgetLamports}
                                  paymentToken={task.paymentToken}
                                  customTokenMint={task.customTokenMint}
                                  customTokenSymbol={task.customTokenSymbol}
                                  customTokenDecimals={task.customTokenDecimals}
                                  onDone={onRefresh}
                                />
                              ))}
                          </div>
                        ) : (
                          <SelectWinnerButton
                            bid={matchedBid as unknown as WinnerBid}
                            taskId={task.id}
                            taskType={task.taskType}
                            taskMultisigAddress={task.multisigAddress}
                            winnerPlace={1}
                            prizeAmountLamports={prizeForPlace(1) || task.budgetLamports}
                            paymentToken={task.paymentToken}
                            customTokenMint={task.customTokenMint}
                            customTokenSymbol={task.customTokenSymbol}
                            customTokenDecimals={task.customTokenDecimals}
                            onDone={onRefresh}
                          />
                        )
                      )}
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
