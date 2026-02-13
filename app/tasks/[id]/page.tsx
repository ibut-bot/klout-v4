'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

function useCountdown(deadlineAt: string | null | undefined) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number; expired: boolean } | null>(null)

  useEffect(() => {
    if (!deadlineAt) { setTimeLeft(null); return }
    const calc = () => {
      const diff = new Date(deadlineAt).getTime() - Date.now()
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
      return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
        expired: false,
      }
    }
    setTimeLeft(calc())
    const interval = setInterval(() => setTimeLeft(calc()), 1000)
    return () => clearInterval(interval)
  }, [deadlineAt])

  return timeLeft
}

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(2)} SOL`
}
import { useAuth } from '../../hooks/useAuth'
import Link from 'next/link'
import BidForm from '../../components/BidForm'
import BidList from '../../components/BidList'
import Chat from '../../components/Chat'
import MultisigActions from '../../components/MultisigActions'
import SubmissionForm from '../../components/SubmissionForm'
import SubmissionList from '../../components/SubmissionList'
import CompetitionEntryForm from '../../components/CompetitionEntryForm'
import SelectWinnerButton, { type WinnerBid } from '../../components/SelectWinnerButton'
import CampaignDashboard from '../../components/CampaignDashboard'
import CampaignSubmitForm from '../../components/CampaignSubmitForm'

interface Task {
  id: string
  title: string
  description: string
  budgetLamports: string
  taskType: string
  status: string
  multisigAddress?: string | null
  vaultAddress?: string | null
  creatorWallet: string
  creatorUsername?: string | null
  creatorProfilePic?: string | null
  winningBid: {
    id: string
    amountLamports: string
    multisigAddress: string | null
    vaultAddress: string | null
    proposalIndex: number | null
    paymentTxSig: string | null
    status: string
    bidderWallet: string
    bidderUsername?: string | null
    bidderProfilePic?: string | null
  } | null
  bidCount: number
  messageCount: number
  deadlineAt: string | null
  createdAt: string
}

interface Bid {
  id: string
  bidderId: string
  bidderWallet: string
  bidderUsername?: string | null
  bidderProfilePic?: string | null
  amountLamports: string
  description: string
  multisigAddress: string | null
  vaultAddress: string | null
  proposalIndex?: number | null
  status: string
  hasSubmission?: boolean
  createdAt: string
}

interface SubmissionData {
  id: string
  bidId: string
  description: string
  attachments: any[] | null
  createdAt: string
  bid?: any
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-500/20 text-green-400',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-400',
  COMPLETED: 'bg-zinc-700/50 text-zinc-400',
  DISPUTED: 'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-zinc-700/50 text-zinc-500',
}

const TYPE_COLORS: Record<string, string> = {
  QUOTE: 'bg-indigo-500/20 text-indigo-400',
  COMPETITION: 'bg-amber-500/20 text-amber-400',
  CAMPAIGN: 'bg-accent/20 text-accent',
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { wallet, isAuthenticated, authFetch } = useAuth()

  const [task, setTask] = useState<Task | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [submissions, setSubmissions] = useState<SubmissionData[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [selectedBidderId, setSelectedBidderId] = useState<string | null>(null)
  // Track message counts per bidder for unread indicator
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({})
  // Campaign-specific state
  const [campaignConfig, setCampaignConfig] = useState<{
    cpmLamports: string; budgetRemainingLamports: string; guidelines: { dos: string[]; donts: string[] }; minViews: number; minPayoutLamports: string
  } | null>(null)
  const [xLinked, setXLinked] = useState(false)
  const [dashboardRefresh, setDashboardRefresh] = useState(0)

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}`)
    const data = await res.json()
    if (data.success) {
      setTask(data.task)
      if (data.task.campaignConfig) setCampaignConfig(data.task.campaignConfig)
    }
  }, [id])

  const fetchBids = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}/bids`)
    const data = await res.json()
    if (data.success) setBids(data.bids)
  }, [id])

  const fetchSubmissions = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}/submissions`)
    const data = await res.json()
    if (data.success) setSubmissions(data.submissions)
  }, [id])

  const fetchConversations = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await authFetch(`/api/tasks/${id}/messages`)
      const data = await res.json()
      if (data.success && data.conversations) {
        const counts: Record<string, number> = {}
        for (const c of data.conversations) {
          counts[c.bidderId] = c.messageCount
        }
        setMessageCounts(counts)
      }
    } catch { /* silent */ }
  }, [id, isAuthenticated, authFetch])

  const fetchXStatus = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await authFetch('/api/auth/x/status')
      const data = await res.json()
      if (data.success) setXLinked(data.linked)
    } catch {}
  }, [isAuthenticated, authFetch])

  useEffect(() => {
    Promise.all([fetchTask(), fetchBids(), fetchSubmissions()]).finally(() => setLoading(false))
  }, [fetchTask, fetchBids, fetchSubmissions])

  useEffect(() => {
    if (isAuthenticated) fetchXStatus()
  }, [isAuthenticated, fetchXStatus])

  // Fetch conversation counts for sidebar indicators
  useEffect(() => {
    if (isAuthenticated) fetchConversations()
  }, [isAuthenticated, fetchConversations])

  // Auto-select first bidder for competition mode
  useEffect(() => {
    if (!selectedBidderId && submissions.length > 0 && submissions[0].bid) {
      setSelectedBidderId(submissions[0].bid.bidderId)
    }
  }, [submissions, selectedBidderId])

  const refreshAll = () => {
    fetchTask()
    fetchBids()
    fetchSubmissions()
    fetchConversations()
  }

  // Must be called before any early returns (React hooks rule)
  const countdown = useCountdown(task?.deadlineAt ?? null)

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-8 w-64 animate-pulse rounded bg-surface mb-4" />
        <div className="h-4 w-full animate-pulse rounded bg-surface mb-2" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-surface" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="mx-auto max-w-4xl text-center py-16">
        <h1 className="text-2xl font-bold text-white">Task not found</h1>
      </div>
    )
  }

  const isCreator = wallet === task.creatorWallet
  const isBidder = bids.some((b) => b.bidderWallet === wallet)
  const isWinningBidder = task.winningBid?.bidderWallet === wallet
  const isCompetition = task.taskType === 'COMPETITION'
  const isCampaign = task.taskType === 'CAMPAIGN'
  const campaignBudgetExhausted = isCampaign && campaignConfig && Number(campaignConfig.budgetRemainingLamports) <= 0
  const isExpired = countdown?.expired === true

  // Find current user's bid
  const myBid = bids.find((b) => b.bidderWallet === wallet)
  const mySubmission = myBid ? submissions.find((s) => s.bidId === myBid.id) : null

  // Competition entry form: shown when user hasn't entered yet
  const showCompetitionEntry = isAuthenticated && !isCreator && !isBidder && isCompetition && task.status === 'OPEN' && !isExpired

  // Quote submission form: shown after winning bid is accepted/funded
  const showSubmissionForm = isAuthenticated && !isCreator && !isCompetition && myBid && !mySubmission && (
    isWinningBidder && ['ACCEPTED', 'FUNDED'].includes(myBid.status)
  )

  const taskUrl = typeof window !== 'undefined' ? `${window.location.origin}/tasks/${id}` : `/tasks/${id}`

  const copyLink = () => {
    navigator.clipboard.writeText(taskUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex items-start justify-between">
          <h1 className="text-2xl font-bold text-white">{task.title}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="shrink-0 rounded-full border border-k-border px-3 py-1 text-xs font-medium text-zinc-400 transition hover:border-k-border-hover hover:bg-surface"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${TYPE_COLORS[task.taskType] || ''}`}>
              {task.taskType === 'COMPETITION' ? 'Competition' : task.taskType === 'CAMPAIGN' ? 'Campaign' : 'Quote'}
            </span>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[task.status] || ''}`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>
        </div>
        {/* Countdown timer for competitions/campaigns with a deadline (hidden when campaign budget exhausted) */}
        {(isCompetition || isCampaign) && countdown && !campaignBudgetExhausted && (
          <div className={`mb-3 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
            countdown.expired
              ? 'border-red-500/20 bg-red-500/10 text-red-400'
              : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
          }`}>
            {countdown.expired ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span className="font-medium">{isCampaign ? 'Campaign' : 'Competition'} ended — no more submissions accepted</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>
                  <span className="font-medium">Time remaining:</span>{' '}
                  {countdown.days > 0 && `${countdown.days}d `}
                  {String(countdown.hours).padStart(2, '0')}h{' '}
                  {String(countdown.minutes).padStart(2, '0')}m{' '}
                  {String(countdown.seconds).padStart(2, '0')}s
                </span>
              </>
            )}
          </div>
        )}
        {/* Task info inline */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-500">
          <span className="font-semibold text-accent">
            {formatSol(task.budgetLamports)}
          </span>
          <Link href={`/u/${task.creatorWallet}`} className="flex items-center gap-2 hover:text-zinc-300">
            {task.creatorProfilePic ? (
              <img
                src={task.creatorProfilePic}
                alt=""
                className="h-[30px] w-[30px] rounded-full object-cover"
              />
            ) : (
              <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-600 bg-zinc-800 text-zinc-300">
                {task.creatorWallet.slice(0, 2)}
              </div>
            )}
            <span>by {task.creatorUsername || `${task.creatorWallet.slice(0, 6)}...${task.creatorWallet.slice(-4)}`}</span>
          </Link>
          <span>{new Date(task.createdAt).toLocaleDateString()}</span>
          <span className="text-zinc-400">•</span>
          <span>{task.bidCount} bids</span>
          <span className="text-zinc-400">•</span>
          <span>{task.messageCount} messages</span>
          {submissions.length > 0 && (
            <>
              <span className="text-zinc-400">•</span>
              <span>{submissions.length} submissions</span>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="mb-6">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {task.description}
        </p>
      </div>

      {/* Winning bid escrow - show above the bids/chat area when applicable */}
      {task.winningBid && (isCreator || isWinningBidder) && (
        <div className="mb-6">
          <MultisigActions
            taskId={task.id}
            bidId={task.winningBid.id}
            bidStatus={task.winningBid.status}
            vaultAddress={task.winningBid.vaultAddress}
            multisigAddress={task.winningBid.multisigAddress}
            amountLamports={task.winningBid.amountLamports}
            proposalIndex={task.winningBid.proposalIndex}
            paymentTxSig={task.winningBid.paymentTxSig}
            bidderWallet={task.winningBid.bidderWallet}
            bidderUsername={task.winningBid.bidderUsername}
            bidderProfilePic={task.winningBid.bidderProfilePic}
            isCreator={isCreator}
            isBidder={isWinningBidder}
            taskType={task.taskType}
            onUpdate={refreshAll}
          />
        </div>
      )}

      {/* Competition entry form (combined bid + submission) */}
      {showCompetitionEntry && (
        <div className="mb-6">
          <CompetitionEntryForm
            taskId={task.id}
            onEntrySubmitted={refreshAll}
          />
        </div>
      )}

      {/* Quote mode submission form for winning bidder */}
      {showSubmissionForm && myBid && (
        <div className="mb-6">
          <SubmissionForm
            taskId={task.id}
            bidId={myBid.id}
            creatorWallet={task.creatorWallet}
            amountLamports={myBid.amountLamports}
            taskType={task.taskType}
            onSubmitted={refreshAll}
          />
        </div>
      )}

      {/* Competition mode: Narrow sidebar (entries) + Chat with pinned submission */}
      {isCompetition && (() => {
        // For bidders, always show their own submission; for creators, show selected bidder's submission
        const displayBid = isCreator 
          ? bids.find(b => b.bidderId === selectedBidderId)
          : myBid
        const displaySub = displayBid 
          ? submissions.find(s => s.bidId === displayBid.id) 
          : null
        const canSelectWinner = isCreator && task.status === 'OPEN' && displayBid?.status === 'PENDING'

        // Filter submissions: creators see all, bidders only see their own
        const visibleSubmissions = isCreator 
          ? submissions 
          : submissions.filter(s => s.bidId === myBid?.id)

        // Build pinned content for the chat panel
        const pinnedContent = displaySub ? (
          <div className="rounded-lg border border-k-border bg-surface p-3 border-k-border bg-surface">
            <p className="mb-2 text-xs font-medium text-zinc-500">Submission</p>
            <p className="mb-2 whitespace-pre-wrap text-sm text-zinc-300 text-zinc-300">
              {displaySub.description}
            </p>
            {displaySub.attachments && displaySub.attachments.length > 0 && (
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(displaySub.attachments as any[]).map((att: any, i: number) =>
                  att.contentType?.startsWith('video/') ? (
                    <div key={i} className="overflow-hidden rounded-lg border border-k-border border-k-border">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video
                        src={att.url}
                        controls
                        preload="metadata"
                        playsInline
                        className="w-full bg-black"
                        style={{ minHeight: '100px' }}
                      />
                      <p className="truncate px-2 py-1 text-xs text-zinc-500">{att.filename || 'Video'}</p>
                    </div>
                  ) : att.contentType?.startsWith('image/') ? (
                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-k-border border-k-border">
                      <img src={att.url} alt={att.filename || ''} className="h-28 w-full object-cover" />
                      <p className="truncate px-2 py-1 text-xs text-zinc-500">{att.filename || 'Image'}</p>
                    </a>
                  ) : (
                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="flex h-20 items-center justify-center rounded-lg border border-k-border text-xs text-accent underline border-k-border">
                      {att.filename || 'Download'}
                    </a>
                  )
                )}
              </div>
            )}
            {canSelectWinner && displayBid && (
              <SelectWinnerButton
                bid={displayBid as WinnerBid}
                taskId={task.id}
                taskType={task.taskType}
                taskMultisigAddress={task.multisigAddress}
                onDone={refreshAll}
              />
            )}
          </div>
        ) : null

        return (
          <div className={`grid gap-4 ${isCreator ? 'lg:grid-cols-[180px_1fr]' : ''}`}>
            {/* Narrow sidebar: entry list - only shown to creator */}
            {isCreator && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-white">
                Entries ({visibleSubmissions.length})
              </h2>
              <div className="max-h-[560px] space-y-1 overflow-y-auto">
                {visibleSubmissions.map((sub) => {
                  const bid = sub.bid
                  if (!bid) return null
                  const isActive = bid.bidderId === selectedBidderId
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedBidderId(bid.bidderId)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'bg-accent text-black'
                          : 'hover:bg-surface-hover hover:bg-surface-hover'
                      }`}
                    >
                      {bid.bidderProfilePic ? (
                        <img src={bid.bidderProfilePic} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                          isActive
                            ? 'bg-accent/30 text-accent'
                            : 'bg-zinc-800 text-zinc-600 bg-zinc-800 text-zinc-300'
                        }`}>
                          {bid.bidderWallet.slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-medium ${isActive ? '' : 'text-zinc-100'}`}>
                          {bid.bidderUsername || `${bid.bidderWallet.slice(0, 4)}...${bid.bidderWallet.slice(-4)}`}
                        </p>
                        <p className={`truncate text-[10px] ${isActive ? 'opacity-70' : 'text-zinc-400'}`}>
                          {new Date(sub.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {(messageCounts[bid.bidderId] || 0) > 0 && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${isActive ? 'opacity-70' : 'text-amber-500'}`}>
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      )}
                    </button>
                  )
                })}
                {visibleSubmissions.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-zinc-400">No entries yet.</p>
                )}
              </div>
            </div>
            )}

            {/* Chat panel with pinned submission */}
            {isAuthenticated && (isCreator || isBidder) ? (
              <Chat
                taskId={task.id}
                isCreator={isCreator}
                bidders={isCreator ? bids.map(b => ({ id: b.bidderId, wallet: b.bidderWallet, username: b.bidderUsername, profilePic: b.bidderProfilePic })) : undefined}
                selectedBidderId={isCreator ? selectedBidderId : undefined}
                onBidderChange={isCreator ? setSelectedBidderId : undefined}
                pinnedContent={pinnedContent}
              />
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-k-border p-8 border-k-border">
                <p className="text-sm text-zinc-500">Sign in to view messages and submissions.</p>
              </div>
            )}
          </div>
        )
      })()}

      {/* Quote mode: Submissions (if any) above, then Bids (left) + Chat (right) */}
      {!isCompetition && !isCampaign && submissions.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-white">
            Submissions ({submissions.length})
          </h2>
          <SubmissionList
            submissions={submissions}
            isCreator={isCreator}
            taskId={task.id}
            taskType={task.taskType}
            taskStatus={task.status}
            taskMultisigAddress={task.multisigAddress}
            taskVaultAddress={task.vaultAddress}
            onWinnerSelected={refreshAll}
          />
        </div>
      )}

      {/* Campaign mode */}
      {isCampaign && (
        <div className="space-y-6">
          {/* Campaign dashboard for creator */}
          {isCreator && task.multisigAddress && (
            <CampaignDashboard
              taskId={task.id}
              multisigAddress={task.multisigAddress}
              isCreator={true}
              refreshTrigger={dashboardRefresh}
            />
          )}

          {/* Campaign submission form for participants */}
          {isAuthenticated && !isCreator && campaignConfig && task.status === 'OPEN' && !isExpired && (
            <CampaignSubmitForm
              taskId={task.id}
              guidelines={campaignConfig.guidelines}
              cpmLamports={campaignConfig.cpmLamports}
              budgetRemainingLamports={campaignConfig.budgetRemainingLamports}
              minPayoutLamports={campaignConfig.minPayoutLamports}
              minViews={campaignConfig.minViews}
              xLinked={xLinked}
              onSubmitted={() => { fetchTask(); setDashboardRefresh(n => n + 1) }}
            />
          )}

          {/* Campaign dashboard for non-creators (read-only view) */}
          {isAuthenticated && !isCreator && task.multisigAddress && (
            <CampaignDashboard
              taskId={task.id}
              multisigAddress={task.multisigAddress}
              isCreator={false}
              refreshTrigger={dashboardRefresh}
            />
          )}

          {/* Campaign info for logged-out users */}
          {!isAuthenticated && campaignConfig && (
            <div className="rounded-xl border border-k-border p-4 border-k-border">
              <h3 className="mb-3 text-sm font-semibold text-white">Campaign Details</h3>
              <div className="space-y-2 text-sm text-zinc-600 text-zinc-400">
                <p>CPM: {(Number(campaignConfig.cpmLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL per 1,000 views</p>
                <p>Budget remaining: {(Number(campaignConfig.budgetRemainingLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL</p>
                {Number(campaignConfig.minPayoutLamports) > 0 && (
                  <p>Min payout threshold: {(Number(campaignConfig.minPayoutLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL</p>
                )}
                <p className="text-xs text-zinc-500">Connect your wallet and link your X account to participate.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {!isCompetition && !isCampaign && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-lg font-semibold text-white">
              Bids ({bids.length})
            </h2>
            <div className="max-h-[500px] overflow-y-auto pr-2">
              <BidList
                bids={bids}
                taskId={task.id}
                isCreator={isCreator}
                taskStatus={task.status}
                taskType={task.taskType}
                onBidAccepted={refreshAll}
                selectedBidId={bids.find(b => b.bidderId === selectedBidderId)?.id}
                onBidSelect={isCreator ? (bidId) => {
                  const bid = bids.find(b => b.id === bidId)
                  if (bid) setSelectedBidderId(bid.bidderId)
                } : undefined}
              />
            </div>
            {isAuthenticated && !isCreator && task.status === 'OPEN' && !isBidder && (
              <div className="mt-4">
                <BidForm
                  taskId={task.id}
                  creatorWallet={task.creatorWallet}
                  taskType={task.taskType}
                  onBidPlaced={fetchBids}
                />
              </div>
            )}
          </div>

          {isAuthenticated && (isCreator || isBidder) && (
            <div>
              <Chat
                taskId={task.id}
                isCreator={isCreator}
                bidders={isCreator ? bids.map(b => ({ id: b.bidderId, wallet: b.bidderWallet, username: b.bidderUsername, profilePic: b.bidderProfilePic })) : undefined}
                selectedBidderId={isCreator ? selectedBidderId : undefined}
                onBidderChange={isCreator ? setSelectedBidderId : undefined}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
