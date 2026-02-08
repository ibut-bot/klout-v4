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
import BidForm from '../../components/BidForm'
import BidList from '../../components/BidList'
import Chat from '../../components/Chat'
import MultisigActions from '../../components/MultisigActions'

interface Task {
  id: string
  title: string
  description: string
  budgetLamports: string
  status: string
  creatorWallet: string
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
  bidderProfilePic?: string | null
  amountLamports: string
  description: string
  multisigAddress: string | null
  vaultAddress: string | null
  status: string
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  COMPLETED: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  DISPUTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { wallet, isAuthenticated } = useAuth()

  const [task, setTask] = useState<Task | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

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

  useEffect(() => {
    Promise.all([fetchTask(), fetchBids()]).finally(() => setLoading(false))
  }, [fetchTask, fetchBids])

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

  const taskUrl = typeof window !== 'undefined' ? `${window.location.origin}/tasks/${id}` : `/tasks/${id}`

  const copyLink = () => {
    navigator.clipboard.writeText(taskUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 flex items-start justify-between">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{task.title}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[task.status] || ''}`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-500">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {formatSol(task.budgetLamports)}
          </span>
          <div className="flex items-center gap-2">
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
            <span>by {task.creatorWallet.slice(0, 6)}...{task.creatorWallet.slice(-4)}</span>
          </div>
          <span>{new Date(task.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-8 lg:col-span-2">
          {/* Description */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Description</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {task.description}
            </p>
          </div>

          {/* Bids */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Bids ({bids.length})
            </h2>
            <BidList
              bids={bids}
              taskId={task.id}
              isCreator={isCreator}
              taskStatus={task.status}
              onBidAccepted={() => { fetchTask(); fetchBids() }}
            />
          </div>

          {/* Bid form */}
          {isAuthenticated && !isCreator && task.status === 'OPEN' && !isBidder && (
            <BidForm taskId={task.id} creatorWallet={task.creatorWallet} onBidPlaced={fetchBids} />
          )}

          {/* Chat - Private conversations between creator and individual bidders */}
          {isAuthenticated && (isCreator || isBidder) && (
            <Chat
              taskId={task.id}
              isCreator={isCreator}
              bidders={isCreator ? bids.map(b => ({ id: b.bidderId, wallet: b.bidderWallet, profilePic: b.bidderProfilePic })) : undefined}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Winning bid escrow */}
          {task.winningBid && (isCreator || isWinningBidder) && (
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
              bidderProfilePic={task.winningBid.bidderProfilePic}
              isCreator={isCreator}
              isBidder={isWinningBidder}
              onUpdate={() => { fetchTask(); fetchBids() }}
            />
          )}

          {/* Task info */}
          <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <h3 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-50">Task Info</h3>
            <div className="space-y-2 text-zinc-600 dark:text-zinc-400">
              <div className="flex justify-between">
                <span>Status</span>
                <span className="font-medium">{task.status.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span>Budget</span>
                <span className="font-medium">{formatSol(task.budgetLamports)}</span>
              </div>
              <div className="flex justify-between">
                <span>Bids</span>
                <span className="font-medium">{task.bidCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Messages</span>
                <span className="font-medium">{task.messageCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
