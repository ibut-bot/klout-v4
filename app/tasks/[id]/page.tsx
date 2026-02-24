'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import ImagePositionEditor, { getImageTransformStyle, type ImageTransform } from '../../components/ImagePositionEditor'
import XPostEmbed, { extractXPostUrl } from '../../components/XPostEmbed'
import { formatTokenAmount, resolveTokenInfo, type PaymentTokenType, type TokenInfo } from '@/lib/token-utils'

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
import CompetitionFinishRefund from '../../components/CompetitionFinishRefund'
import CompetitionSubmissionsTable from '../../components/CompetitionSubmissionsTable'

interface Task {
  id: string
  title: string
  description: string
  budgetLamports: string
  taskType: string
  paymentToken?: string
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
  customTokenLogoUri?: string | null
  status: string
  multisigAddress?: string | null
  vaultAddress?: string | null
  imageUrl?: string | null
  imageTransform?: any
  creatorWallet: string
  creatorUsername?: string | null
  creatorProfilePic?: string | null
  maxWinners?: number
  prizeStructure?: { place: number; amountLamports: string }[] | null
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
  winnerPlace?: number | null
  hasSubmission?: boolean
  createdAt: string
}

interface SubmissionData {
  id: string
  bidId: string
  description: string
  attachments: any[] | null
  postUrl?: string | null
  xPostId?: string | null
  postText?: string | null
  postMedia?: { type: string; url?: string; previewImageUrl?: string }[] | null
  postAuthorName?: string | null
  postAuthorUsername?: string | null
  postAuthorProfilePic?: string | null
  viewCount?: number | null
  likeCount?: number | null
  retweetCount?: number | null
  commentCount?: number | null
  metricsReadAt?: string | null
  createdAt: string
  bid?: any
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-500/20 text-green-400',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-400',
  COMPLETED: 'bg-zinc-700/50 text-zinc-400',
  DISPUTED: 'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-zinc-700/50 text-zinc-500',
  PAUSED: 'bg-amber-500/20 text-amber-400',
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
  // Competition pause / finish-refund state
  const [compPauseLoading, setCompPauseLoading] = useState(false)
  const [compPauseError, setCompPauseError] = useState('')
  const [compFinishOpen, setCompFinishOpen] = useState(false)
  const [compMenuOpen, setCompMenuOpen] = useState(false)
  // Campaign-specific state
  const [campaignConfig, setCampaignConfig] = useState<{
    cpmLamports: string; budgetRemainingLamports: string; guidelines: { dos: string[]; donts: string[] }; heading?: string | null; minViews: number; minLikes: number; minRetweets: number; minComments: number; minPayoutLamports: string; maxBudgetPerUserPercent?: number; maxBudgetPerPostPercent?: number; minKloutScore?: number | null; requireFollowX?: string | null; collateralLink?: string | null; bonusMinKloutScore?: number | null; bonusMaxLamports?: string | null
  } | null>(null)
  const [xLinked, setXLinked] = useState(false)
  const [hasKloutScore, setHasKloutScore] = useState(false)
  const [kloutScore, setKloutScore] = useState(0)
  const [dashboardRefresh, setDashboardRefresh] = useState(0)
  const [isSharedViewer, setIsSharedViewer] = useState(false)
  // Image repositioning state
  const [editingImage, setEditingImage] = useState(false)
  const [imgTransform, setImgTransform] = useState<ImageTransform>({ scale: 1, x: 50, y: 50 })
  const [savingImage, setSavingImage] = useState(false)

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}`)
    const data = await res.json()
    if (data.success) {
      setTask(data.task)
      if (data.task.campaignConfig) setCampaignConfig(data.task.campaignConfig)
    }
  }, [id])

  const handleSaveImagePosition = async () => {
    if (!task) return
    setSavingImage(true)
    try {
      const res = await authFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageTransform: imgTransform }),
      })
      const data = await res.json()
      if (data.success) {
        setTask({ ...task, imageTransform: imgTransform })
        setEditingImage(false)
      }
    } catch {
      // ignore
    } finally {
      setSavingImage(false)
    }
  }

  const fetchBids = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}/bids`)
    const data = await res.json()
    if (data.success) {
      setBids(data.bids)
      if (data.taskType === 'COMPETITION') {
        const subs: SubmissionData[] = data.bids
          .filter((b: any) => b.hasSubmission && b.submission)
          .map((b: any) => ({
            ...b.submission,
            bidId: b.id,
            bid: {
              id: b.id,
              bidderId: b.bidderId,
              bidderWallet: b.bidderWallet,
              bidderUsername: b.bidderUsername,
              bidderProfilePic: b.bidderProfilePic,
              amountLamports: b.amountLamports,
              multisigAddress: b.multisigAddress,
              vaultAddress: b.vaultAddress,
              proposalIndex: b.proposalIndex,
              status: b.status,
            },
          }))
        setSubmissions(subs)
      }
    }
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

  const fetchKloutScore = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await authFetch('/api/klout-score')
      const data = await res.json()
      if (data.success && data.score) {
        setHasKloutScore(true)
        setKloutScore(data.score.totalScore ?? 0)
      }
    } catch {}
  }, [isAuthenticated, authFetch])

  useEffect(() => {
    Promise.all([fetchTask(), fetchBids(), fetchSubmissions()]).finally(() => setLoading(false))
  }, [fetchTask, fetchBids, fetchSubmissions])

  const fetchShareStatus = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await authFetch(`/api/tasks/${id}/share/status`)
      const data = await res.json()
      if (data.success) setIsSharedViewer(data.isSharedViewer)
    } catch {}
  }, [isAuthenticated, authFetch, id])

  useEffect(() => {
    if (isAuthenticated) {
      fetchXStatus()
      fetchKloutScore()
      fetchShareStatus()
    }
  }, [isAuthenticated, fetchXStatus, fetchKloutScore, fetchShareStatus])

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

  const handleCompPauseResume = async () => {
    if (!task) return
    const action = task.status === 'PAUSED' ? 'resume' : 'pause'
    setCompPauseLoading(true)
    setCompPauseError('')
    try {
      const res = await authFetch(`/api/tasks/${task.id}/pause`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      refreshAll()
    } catch (e: any) {
      setCompPauseError(e.message || 'Failed to pause/resume')
    } finally {
      setCompPauseLoading(false)
    }
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
        <h1 className="text-2xl font-bold text-white">Campaign not found</h1>
      </div>
    )
  }

  const isCreator = wallet === task.creatorWallet
  const isBidder = bids.some((b) => b.bidderWallet === wallet)
  const isWinningBidder = task.winningBid?.bidderWallet === wallet
  const isCompetition = task.taskType === 'COMPETITION'
  const isCampaign = task.taskType === 'CAMPAIGN'
  const pt = (task.paymentToken as PaymentTokenType) || 'SOL'
  const tInfo = resolveTokenInfo(pt, task.customTokenMint, task.customTokenSymbol, task.customTokenDecimals)
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
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-white min-w-0 break-words">{task.title}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copyLink}
              className="shrink-0 rounded-full border border-k-border px-3 py-1 text-xs font-medium text-zinc-400 transition hover:border-k-border-hover hover:bg-surface"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
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
            {(() => {
              const tInfo = resolveTokenInfo(
                (task.paymentToken as PaymentTokenType) || 'SOL',
                task.customTokenMint,
                task.customTokenSymbol,
                task.customTokenDecimals,
              )
              return `${formatTokenAmount(task.budgetLamports, tInfo, task.taskType === 'CAMPAIGN' ? 0 : 2)} ${tInfo.symbol}`
            })()}
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
          {isCreator && (
            <>
              <span className="text-zinc-400">•</span>
              <span>{task.bidCount} bids</span>
              <span className="text-zinc-400">•</span>
              <span>{task.messageCount} messages</span>
            </>
          )}
          {isCreator && submissions.length > 0 && (
            <>
              <span className="text-zinc-400">•</span>
              <span>{submissions.length} submissions</span>
            </>
          )}
        </div>
      </div>

      {/* Campaign Image */}
      {task.imageUrl && (
        <div className="mb-6 overflow-hidden rounded-xl">
          {editingImage ? (
            <ImagePositionEditor
              imageUrl={task.imageUrl}
              initialTransform={task.imageTransform as ImageTransform || { scale: 1, x: 50, y: 50 }}
              onTransformChange={setImgTransform}
              onSave={handleSaveImagePosition}
              onCancel={() => { setImgTransform(task.imageTransform as ImageTransform || { scale: 1, x: 50, y: 50 }); setEditingImage(false) }}
              height="h-[280px] sm:h-[380px] lg:h-[460px]"
            />
          ) : (
            <div className="relative">
              <img
                src={task.imageUrl}
                alt={task.title}
                className="w-full max-h-[280px] sm:max-h-[380px] lg:max-h-[460px] object-cover"
                style={getImageTransformStyle(task.imageTransform as any)}
              />
              {isCreator && (
                <button
                  onClick={() => { setImgTransform(task.imageTransform as ImageTransform || { scale: 1, x: 50, y: 50 }); setEditingImage(true) }}
                  className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80 backdrop-blur-sm transition"
                >
                  Reposition
                </button>
              )}
            </div>
          )}
        </div>
      )}

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

      {/* Competition: Prize Structure */}
      {isCompetition && task.prizeStructure && (task.prizeStructure as any[]).length > 1 && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-amber-400">Prize Structure</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {(task.prizeStructure as { place: number; amountLamports: string }[]).map((p) => {
              const placeLabels = ['1st', '2nd', '3rd']
              const label = p.place <= 3 ? placeLabels[p.place - 1] : `${p.place}th`
              const winnerBid = bids.find(b => b.winnerPlace === p.place)
              const isAwarded = !!winnerBid
              return (
                <div key={p.place} className={`rounded-lg border p-3 text-center ${isAwarded ? 'border-green-500/30 bg-green-500/10' : 'border-k-border bg-surface'}`}>
                  <p className="text-xs text-zinc-400">{label} Place</p>
                  <p className="text-sm font-bold text-white">{formatTokenAmount(p.amountLamports, tInfo, 2)} {tInfo.symbol}</p>
                  {isAwarded && (
                    <p className="mt-1 truncate text-[10px] text-green-400">
                      {winnerBid.bidderUsername || `${winnerBid.bidderWallet.slice(0, 4)}...`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Competition: Paused banner + subtle management dropdown */}
      {isCompetition && isCreator && task.status === 'PAUSED' && (
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
          Competition is paused — no new entries accepted.
        </div>
      )}
      {isCompetition && isCreator && ['OPEN', 'IN_PROGRESS', 'PAUSED'].includes(task.status) && (
        <div className="mb-4 flex justify-end">
          <div className="relative">
            <button
              onClick={() => setCompMenuOpen(!compMenuOpen)}
              className="rounded-lg border border-k-border px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
            >
              Manage ▾
            </button>
            {compMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCompMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-k-border bg-zinc-900 py-1 shadow-xl">
                  <button
                    onClick={() => { handleCompPauseResume(); setCompMenuOpen(false) }}
                    disabled={compPauseLoading}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-surface-hover disabled:opacity-50"
                  >
                    {task.status === 'PAUSED' ? '▶ Resume Competition' : '⏸ Pause Competition'}
                  </button>
                  <button
                    onClick={() => { setCompFinishOpen(true); setCompMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 transition hover:bg-surface-hover"
                  >
                    ⏹ Stop & Refund Remainder
                  </button>
                </div>
              </>
            )}
          </div>
          {compPauseError && <p className="ml-2 text-xs text-red-400">{compPauseError}</p>}

          {compFinishOpen && task.multisigAddress && (
            <CompetitionFinishRefund
              taskId={task.id}
              multisigAddress={task.multisigAddress}
              budgetLamports={task.budgetLamports}
              paymentToken={pt}
              customTokenMint={task.customTokenMint}
              customTokenSymbol={task.customTokenSymbol}
              customTokenDecimals={task.customTokenDecimals}
              winnersAwarded={bids.filter(b => b.winnerPlace != null).length}
              maxWinners={task.maxWinners || 1}
              onClose={() => setCompFinishOpen(false)}
              onFinished={() => {
                setCompFinishOpen(false)
                refreshAll()
              }}
            />
          )}
        </div>
      )}

      {/* Competition mode: Narrow sidebar (entries) + Chat with pinned submission */}
      {isCompetition && (() => {
        const displayBid = isCreator 
          ? bids.find(b => b.bidderId === selectedBidderId)
          : myBid
        const displaySub = displayBid 
          ? submissions.find(s => s.bidId === displayBid.id) 
          : null

        const maxW = task.maxWinners || 1
        const isMultiWinner = maxW > 1
        const awardedPlaces = bids.filter(b => b.winnerPlace != null).map(b => b.winnerPlace!)
        const nextOpenPlace = isMultiWinner
          ? Array.from({ length: maxW }, (_, i) => i + 1).find(p => !awardedPlaces.includes(p))
          : 1
        const canSelectWinner = isCreator
          && (isMultiWinner ? ['OPEN', 'IN_PROGRESS'].includes(task.status) : task.status === 'OPEN')
          && displayBid?.status === 'PENDING'
          && nextOpenPlace !== undefined

        const prizeForPlace = (place: number) => {
          if (task.prizeStructure && Array.isArray(task.prizeStructure)) {
            const entry = (task.prizeStructure as { place: number; amountLamports: string }[]).find(p => p.place === place)
            return entry?.amountLamports
          }
          return task.budgetLamports
        }

        const visibleSubmissions = isCreator 
          ? submissions 
          : submissions.filter(s => s.bidId === myBid?.id)

        const pinnedContent = displaySub ? (() => {
          const xUrl = extractXPostUrl(displaySub.description || '')
          const descWithoutUrl = xUrl
            ? (displaySub.description || '').replace(xUrl, '').trim()
            : (displaySub.description || '')

          return (
          <div className="rounded-lg border border-k-border bg-surface p-3">
            <p className="mb-2 text-xs font-medium text-zinc-500">Submission</p>
            {displayBid?.winnerPlace && (
              <div className="mb-2">
                <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-400">
                  {displayBid.winnerPlace <= 3
                    ? ['1st', '2nd', '3rd'][displayBid.winnerPlace - 1]
                    : `${displayBid.winnerPlace}th`} Place Winner
                </span>
              </div>
            )}
            {xUrl && (
              <XPostEmbed
                url={xUrl}
                className="mb-3"
                postText={displaySub.postText}
                postMedia={displaySub.postMedia}
                authorUsername={displaySub.postAuthorUsername}
                authorName={displaySub.postAuthorName}
                authorProfilePic={displaySub.postAuthorProfilePic}
              />
            )}
            {displaySub.viewCount != null && (displaySub.viewCount + (displaySub.likeCount ?? 0) + (displaySub.retweetCount ?? 0) + (displaySub.commentCount ?? 0)) > 0 && (
              <div className="mb-3 flex flex-wrap gap-3 rounded-lg border border-k-border bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
                <span title="Views">👁 {displaySub.viewCount.toLocaleString()}</span>
                <span title="Likes">♥ {(displaySub.likeCount ?? 0).toLocaleString()}</span>
                <span title="Retweets">🔁 {(displaySub.retweetCount ?? 0).toLocaleString()}</span>
                <span title="Comments">💬 {(displaySub.commentCount ?? 0).toLocaleString()}</span>
              </div>
            )}
            {descWithoutUrl && (
              <p className="mb-2 whitespace-pre-wrap text-sm text-zinc-300">
                {descWithoutUrl}
              </p>
            )}
            {displaySub.attachments && displaySub.attachments.length > 0 && (
              <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(displaySub.attachments as any[]).map((att: any, i: number) =>
                  att.contentType?.startsWith('video/') ? (
                    <div key={i} className="overflow-hidden rounded-lg border border-k-border">
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
                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-k-border">
                      <img src={att.url} alt={att.filename || ''} className="h-28 w-full object-cover" />
                      <p className="truncate px-2 py-1 text-xs text-zinc-500">{att.filename || 'Image'}</p>
                    </a>
                  ) : (
                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="flex h-20 items-center justify-center rounded-lg border border-k-border text-xs text-accent underline">
                      {att.filename || 'Download'}
                    </a>
                  )
                )}
              </div>
            )}
            {canSelectWinner && displayBid && nextOpenPlace !== undefined && (
              isMultiWinner ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Award a place to this entry:</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: maxW }, (_, i) => i + 1)
                      .filter(p => !awardedPlaces.includes(p))
                      .map(place => {
                        const placeLabels = ['1st', '2nd', '3rd']
                        const label = place <= 3 ? placeLabels[place - 1] : `${place}th`
                        const amount = prizeForPlace(place) || task.budgetLamports
                        return (
                          <SelectWinnerButton
                            key={place}
                            bid={displayBid as WinnerBid}
                            taskId={task.id}
                            taskType={task.taskType}
                            taskMultisigAddress={task.multisigAddress}
                            winnerPlace={place}
                            prizeAmountLamports={amount}
                            paymentToken={task.paymentToken}
                            customTokenMint={task.customTokenMint}
                            customTokenSymbol={task.customTokenSymbol}
                            customTokenDecimals={task.customTokenDecimals}
                            onDone={refreshAll}
                          />
                        )
                      })}
                  </div>
                </div>
              ) : (
                <SelectWinnerButton
                  bid={displayBid as WinnerBid}
                  taskId={task.id}
                  taskType={task.taskType}
                  taskMultisigAddress={task.multisigAddress}
                  winnerPlace={1}
                  prizeAmountLamports={prizeForPlace(1) || task.budgetLamports}
                  paymentToken={task.paymentToken}
                  customTokenMint={task.customTokenMint}
                  customTokenSymbol={task.customTokenSymbol}
                  customTokenDecimals={task.customTokenDecimals}
                  onDone={refreshAll}
                />
              )
            )}
          </div>
          )
        })() : null

        const mySubmission = !isCreator && myBid ? submissions.find(s => s.bidId === myBid.id) : null
        const myXUrl = mySubmission ? (mySubmission.postUrl || extractXPostUrl(mySubmission.description || '')) : null
        const myDescWithoutUrl = mySubmission && myXUrl
          ? (mySubmission.description || '').replace(myXUrl, '').trim()
          : mySubmission?.description || ''
        const myWinPlace = myBid ? bids.find(b => b.id === myBid.id)?.winnerPlace : null

        return (
          <>
          {/* Participant: show their submission prominently */}
          {!isCreator && mySubmission && (
            <div className="mb-6 rounded-xl border border-k-border bg-surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-k-border px-4 py-3">
                <h3 className="text-sm font-semibold text-white">Your Submission</h3>
                {myWinPlace ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
                    🏆 {myWinPlace <= 3 ? ['1st', '2nd', '3rd'][myWinPlace - 1] : `${myWinPlace}th`} Place Winner
                  </span>
                ) : myBid && bids.find(b => b.id === myBid.id)?.status === 'REJECTED' ? (
                  <span className="inline-flex items-center rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
                    Not Selected
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
                    Under Review
                  </span>
                )}
              </div>
              <div className="p-4">
                {myXUrl && (
                  <XPostEmbed
                    url={myXUrl}
                    className="mb-4"
                    postText={mySubmission.postText}
                    postMedia={mySubmission.postMedia}
                    authorUsername={mySubmission.postAuthorUsername}
                    authorName={mySubmission.postAuthorName}
                    authorProfilePic={mySubmission.postAuthorProfilePic}
                  />
                )}
                {mySubmission.viewCount != null && (mySubmission.viewCount + (mySubmission.likeCount ?? 0) + (mySubmission.retweetCount ?? 0) + (mySubmission.commentCount ?? 0)) > 0 && (
                  <div className="mb-4 grid grid-cols-4 gap-3">
                    {[
                      { label: 'Views', value: mySubmission.viewCount },
                      { label: 'Likes', value: mySubmission.likeCount ?? 0 },
                      { label: 'Retweets', value: mySubmission.retweetCount ?? 0 },
                      { label: 'Replies', value: mySubmission.commentCount ?? 0 },
                    ].map(m => (
                      <div key={m.label} className="rounded-lg border border-k-border bg-zinc-900/50 px-3 py-2 text-center">
                        <p className="text-lg font-semibold text-zinc-100">{m.value.toLocaleString()}</p>
                        <p className="text-[11px] text-zinc-500">{m.label}</p>
                      </div>
                    ))}
                  </div>
                )}
                {myDescWithoutUrl && (
                  <p className="whitespace-pre-wrap text-sm text-zinc-400">{myDescWithoutUrl}</p>
                )}
              </div>
            </div>
          )}

          {isCreator && (
            <CompetitionSubmissionsTable
              submissions={submissions}
              bids={bids}
              task={task}
              isCreator={isCreator}
              onRefresh={refreshAll}
              onSelectBidder={setSelectedBidderId}
            />
          )}
          <div className={`grid gap-4 ${isCreator ? 'lg:grid-cols-[200px_1fr]' : ''}`}>
            {isCreator && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-white">
                Entries ({visibleSubmissions.length})
              </h2>
              <div className="max-h-[560px] space-y-1 overflow-y-auto">
                {visibleSubmissions.map((sub) => {
                  const bid = sub.bid
                  if (!bid) return null
                  const matchedBid = bids.find(b => b.id === bid.id)
                  const isActive = bid.bidderId === selectedBidderId
                  const winPlace = matchedBid?.winnerPlace
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedBidderId(bid.bidderId)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'bg-accent text-black'
                          : winPlace
                            ? 'bg-green-500/10 hover:bg-green-500/20'
                            : 'hover:bg-surface-hover'
                      }`}
                    >
                      {bid.bidderProfilePic ? (
                        <img src={bid.bidderProfilePic} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                          isActive
                            ? 'bg-accent/30 text-accent'
                            : 'bg-zinc-800 text-zinc-300'
                        }`}>
                          {bid.bidderWallet.slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-medium ${isActive ? '' : 'text-zinc-100'}`}>
                          {bid.bidderUsername || `${bid.bidderWallet.slice(0, 4)}...${bid.bidderWallet.slice(-4)}`}
                        </p>
                        <p className={`truncate text-[10px] ${isActive ? 'opacity-70' : 'text-zinc-400'}`}>
                          {winPlace
                            ? `${winPlace <= 3 ? ['1st', '2nd', '3rd'][winPlace - 1] : `${winPlace}th`} Place`
                            : new Date(sub.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {winPlace && (
                        <span className="shrink-0 rounded-full bg-green-500/20 px-1.5 py-0.5 text-[9px] font-bold text-green-400">
                          #{winPlace}
                        </span>
                      )}
                      {!winPlace && (messageCounts[bid.bidderId] || 0) > 0 && (
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
              <div className="flex items-center justify-center rounded-xl border border-k-border p-8">
                <p className="text-sm text-zinc-500">Sign in to view messages and submissions.</p>
              </div>
            )}
          </div>
          </>
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
          {/* Campaign dashboard for creator or shared viewer */}
          {(isCreator || isSharedViewer) && task.multisigAddress && (
            <CampaignDashboard
              taskId={task.id}
              multisigAddress={task.multisigAddress}
              isCreator={isCreator}
              isSharedViewer={!isCreator && isSharedViewer}
              refreshTrigger={dashboardRefresh}
              paymentToken={(task.paymentToken as PaymentTokenType) || 'SOL'}
              customTokenMint={task.customTokenMint}
              customTokenSymbol={task.customTokenSymbol}
              customTokenDecimals={task.customTokenDecimals}
              taskStatus={task.status}
              onStatusChange={(newStatus) => { setTask({ ...task, status: newStatus }); fetchTask() }}
            />
          )}

          {/* Custom token info block */}
          {task.paymentToken === 'CUSTOM' && task.customTokenMint && (
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
              <h3 className="mb-2 text-sm font-semibold text-white">Custom Token</h3>
              <div className="space-y-1 text-sm text-zinc-400">
                <p>Symbol: <span className="font-semibold text-accent">{task.customTokenSymbol || 'Unknown'}</span></p>
                <p>Decimals: <span className="text-zinc-200">{task.customTokenDecimals}</span></p>
                <p className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span>Contract:</span> <code className="text-xs text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded font-mono break-all">{task.customTokenMint}</code>
                </p>
              </div>
            </div>
          )}

          {/* Paused banner */}
          {task.status === 'PAUSED' && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              <span className="font-medium">This campaign is paused and not accepting new submissions.</span>
            </div>
          )}

          {/* Campaign submission form for participants (not shared viewers) */}
          {isAuthenticated && !isCreator && !isSharedViewer && campaignConfig && task.status === 'OPEN' && !isExpired && (
            <CampaignSubmitForm
              taskId={task.id}
              guidelines={campaignConfig.guidelines}
              cpmLamports={campaignConfig.cpmLamports}
              budgetLamports={task.budgetLamports}
              budgetRemainingLamports={campaignConfig.budgetRemainingLamports}
              minPayoutLamports={campaignConfig.minPayoutLamports}
              minViews={campaignConfig.minViews}
              minLikes={campaignConfig.minLikes}
              minRetweets={campaignConfig.minRetweets}
              minComments={campaignConfig.minComments}
              maxBudgetPerUserPercent={campaignConfig.maxBudgetPerUserPercent}
              maxBudgetPerPostPercent={campaignConfig.maxBudgetPerPostPercent}
              minKloutScore={campaignConfig.minKloutScore}
              requireFollowX={campaignConfig.requireFollowX}
              collateralLink={campaignConfig.collateralLink}
              kloutScore={kloutScore}
              xLinked={xLinked}
              hasKloutScore={hasKloutScore}
              onSubmitted={() => { fetchTask(); setDashboardRefresh(n => n + 1) }}
              paymentToken={(task.paymentToken as PaymentTokenType) || 'SOL'}
              customTokenMint={task.customTokenMint}
              customTokenSymbol={task.customTokenSymbol}
              customTokenDecimals={task.customTokenDecimals}
            />
          )}

          {/* Campaign dashboard for non-creators (participant view, excludes shared viewers who see creator view above) */}
          {isAuthenticated && !isCreator && !isSharedViewer && task.multisigAddress && (
            <CampaignDashboard
              taskId={task.id}
              multisigAddress={task.multisigAddress}
              isCreator={false}
              refreshTrigger={dashboardRefresh}
              paymentToken={(task.paymentToken as PaymentTokenType) || 'SOL'}
              customTokenMint={task.customTokenMint}
              customTokenSymbol={task.customTokenSymbol}
              customTokenDecimals={task.customTokenDecimals}
            />
          )}

          {/* Campaign info for logged-out users */}
          {!isAuthenticated && campaignConfig && (() => {
            const tInfo = resolveTokenInfo(
              (task.paymentToken as PaymentTokenType) || 'SOL',
              task.customTokenMint,
              task.customTokenSymbol,
              task.customTokenDecimals,
            )
            return (
              <div className="rounded-xl border border-k-border p-4 border-k-border">
                <h3 className="mb-3 text-sm font-semibold text-white">Campaign Details</h3>
                <div className="space-y-2 text-sm text-zinc-600 text-zinc-400">
                  <p>CPM: {formatTokenAmount(campaignConfig.cpmLamports, tInfo, 2)} {tInfo.symbol} per 1,000 views</p>
                  <p>Budget remaining: {formatTokenAmount(campaignConfig.budgetRemainingLamports, tInfo, 2)} {tInfo.symbol}</p>
                  {Number(campaignConfig.minPayoutLamports) > 0 && (
                    <p>Min payout threshold: {formatTokenAmount(campaignConfig.minPayoutLamports, tInfo, 2)} {tInfo.symbol}</p>
                  )}
                  {campaignConfig.maxBudgetPerUserPercent != null && (
                    <p>Max per user: {campaignConfig.maxBudgetPerUserPercent}% of budget</p>
                  )}
                  {campaignConfig.maxBudgetPerPostPercent != null && (
                    <p>Max per post: {campaignConfig.maxBudgetPerPostPercent}% of budget</p>
                  )}
                  {campaignConfig.minKloutScore != null && (
                    <p>Min Klout score: {campaignConfig.minKloutScore.toLocaleString()}</p>
                  )}
                  {campaignConfig.bonusMinKloutScore != null && campaignConfig.bonusMaxLamports != null && (
                    <p>Klout bonus: Up to {formatTokenAmount(campaignConfig.bonusMaxLamports, tInfo, 2)} {tInfo.symbol} for users with score {'>='} {campaignConfig.bonusMinKloutScore.toLocaleString()} (one-time)</p>
                  )}
                  {campaignConfig.requireFollowX && (
                    <p>Follow required: <a href={`https://x.com/${campaignConfig.requireFollowX}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">@{campaignConfig.requireFollowX}</a></p>
                  )}
                  {task.paymentToken === 'CUSTOM' && task.customTokenMint && (
                    <p>Token: <span className="font-semibold text-accent">{tInfo.symbol}</span> <code className="text-xs text-zinc-500 font-mono">({task.customTokenMint.slice(0, 8)}...)</code></p>
                  )}
                  {campaignConfig.collateralLink && (
                    <p>
                      Collateral:{' '}
                      <a href={campaignConfig.collateralLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline underline-offset-2">
                        View campaign assets
                      </a>
                    </p>
                  )}
                  <p className="text-xs text-zinc-500">Connect your wallet and link your X account to participate.</p>
                </div>
              </div>
            )
          })()}
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
