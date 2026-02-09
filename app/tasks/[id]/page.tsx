'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

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

interface Task {
  id: string
  title: string
  description: string
  budgetLamports: string
  taskType: string
  status: string
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
  OPEN: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  COMPLETED: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  DISPUTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
}

const TYPE_COLORS: Record<string, string> = {
  QUOTE: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  COMPETITION: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { wallet, isAuthenticated } = useAuth()

  const [task, setTask] = useState<Task | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [submissions, setSubmissions] = useState<SubmissionData[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [selectedBidderId, setSelectedBidderId] = useState<string | null>(null)

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}`)
    const data = await res.json()
    if (data.success) setTask(data.task)
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

  useEffect(() => {
    Promise.all([fetchTask(), fetchBids(), fetchSubmissions()]).finally(() => setLoading(false))
  }, [fetchTask, fetchBids, fetchSubmissions])

  const refreshAll = () => {
    fetchTask()
    fetchBids()
    fetchSubmissions()
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-8 w-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900 mb-4" />
        <div className="h-4 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-900 mb-2" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="mx-auto max-w-4xl text-center py-16">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Task not found</h1>
      </div>
    )
  }

  const isCreator = wallet === task.creatorWallet
  const isBidder = bids.some((b) => b.bidderWallet === wallet)
  const isWinningBidder = task.winningBid?.bidderWallet === wallet
  const isCompetition = task.taskType === 'COMPETITION'

  // Find current user's bid
  const myBid = bids.find((b) => b.bidderWallet === wallet)
  const mySubmission = myBid ? submissions.find((s) => s.bidId === myBid.id) : null

  // Show submission form for bidders:
  // Competition: bidder has a PENDING bid and hasn't submitted yet
  // Quote: bidder is the winning bidder, bid is ACCEPTED or FUNDED, and hasn't submitted yet
  const showSubmissionForm = isAuthenticated && !isCreator && myBid && !mySubmission && (
    isCompetition
      ? myBid.status === 'PENDING'
      : (isWinningBidder && ['ACCEPTED', 'FUNDED'].includes(myBid.status))
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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{task.title}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${TYPE_COLORS[task.taskType] || ''}`}>
              {task.taskType === 'COMPETITION' ? 'Competition' : 'Quote'}
            </span>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[task.status] || ''}`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>
        </div>
        {/* Task info inline */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-500">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {formatSol(task.budgetLamports)}
          </span>
          <Link href={`/u/${task.creatorWallet}`} className="flex items-center gap-2 hover:text-zinc-700 dark:hover:text-zinc-300">
            {task.creatorProfilePic ? (
              <img
                src={task.creatorProfilePic}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
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
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
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

      {/* Submission form for bidders */}
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

      {/* Submissions section for competition mode or when submissions exist */}
      {(isCompetition || submissions.length > 0) && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Submissions ({submissions.length})
          </h2>
          <SubmissionList
            submissions={submissions}
            isCreator={isCreator}
            taskType={task.taskType}
            taskStatus={task.status}
            onSelectWinner={isCreator ? (bidId) => {
              // This triggers accept + fund flow for competition mode
              // Handled in BidList's accept flow
              const bid = bids.find(b => b.id === bidId)
              if (bid) setSelectedBidderId(bid.bidderId)
            } : undefined}
          />
        </div>
      )}

      {/* Bids (left) + Chat (right) layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Bids */}
        <div>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
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
          {/* Bid form */}
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

        {/* Right: Chat */}
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
    </div>
  )
}
