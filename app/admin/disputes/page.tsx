'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import Link from 'next/link'

const ARBITER_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS

interface Dispute {
  id: string
  raisedBy: 'CREATOR' | 'BIDDER'
  raisedByWallet: string
  proposalIndex: number
  reason: string
  evidenceUrls: string[]
  status: 'PENDING' | 'ACCEPTED' | 'DENIED'
  responseReason: string | null
  responseEvidence: string[]
  resolutionNotes: string | null
  createdAt: string
  resolvedAt: string | null
  task: {
    id: string
    title: string
    status: string
    budgetLamports: string
    creator: { walletAddress: string; profilePicUrl: string | null }
  }
  bid: {
    id: string
    amountLamports: string
    status: string
    multisigAddress: string | null
    vaultAddress: string | null
    bidder: { walletAddress: string; profilePicUrl: string | null }
  }
}

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(4)} SOL`
}

function shortenWallet(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-500/20 text-amber-400',
  ACCEPTED: 'bg-green-500/20 text-green-400',
  DENIED: 'bg-red-500/20 text-red-400',
}

export default function AdminDisputesPage() {
  const { wallet, isAuthenticated, connected, authFetch } = useAuth()
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  const [isArbiter, setIsArbiter] = useState(false)

  const fetchDisputes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/disputes?status=${statusFilter}`)
      const data = await res.json()
      if (data.success) {
        setDisputes(data.disputes)
        setIsArbiter(data.isArbiter)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [authFetch, statusFilter])

  useEffect(() => {
    if (isAuthenticated) {
      fetchDisputes()
    }
  }, [isAuthenticated, fetchDisputes])

  if (!connected) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold text-white">Arbitration Dashboard</h1>
        <p className="text-zinc-500">Connect your wallet to access the arbitration dashboard.</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold text-white">Arbitration Dashboard</h1>
        <p className="text-zinc-500">Sign in with your wallet to access the arbitration dashboard.</p>
      </div>
    )
  }

  // Check if connected wallet is the arbiter
  const isArbiterWallet = wallet === ARBITER_WALLET

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Arbitration Dashboard</h1>
        {isArbiterWallet ? (
          <p className="text-sm text-green-400">
            Connected as arbiter. You can resolve disputes.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            Viewing disputes you&apos;re involved in. Connect the arbiter wallet to resolve disputes.
          </p>
        )}
      </div>

      {/* Status Filter */}
      <div className="mb-6 flex gap-2">
        {['PENDING', 'ACCEPTED', 'DENIED'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-accent text-black'
                : 'bg-zinc-700/50 text-zinc-400 hover:bg-surface-hover'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Disputes List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : disputes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-k-border p-8 text-center">
          <p className="text-zinc-500">No {statusFilter.toLowerCase()} disputes found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => (
            <Link
              key={dispute.id}
              href={`/admin/disputes/${dispute.id}`}
              className="block rounded-xl border border-k-border p-5 hover:border-k-border-hover transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-zinc-100 truncate">
                    {dispute.task.title}
                  </h3>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    Escrow: {formatSol(dispute.bid.amountLamports)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[dispute.status]}`}>
                  {dispute.status}
                </span>
              </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                <div>
                  <p className="text-zinc-500">Raised by</p>
                  <p className="text-zinc-100 font-mono text-xs">
                    {dispute.raisedBy} (
                    <span
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        window.location.href = `/u/${dispute.raisedByWallet}`
                      }}
                      className="hover:text-accent cursor-pointer"
                    >
                      {shortenWallet(dispute.raisedByWallet)}
                    </span>
                    )
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Proposal #</p>
                  <p className="text-zinc-100">{dispute.proposalIndex}</p>
                </div>
              </div>

              <p className="text-sm text-zinc-400 line-clamp-2">
                {dispute.reason}
              </p>

              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>Created {new Date(dispute.createdAt).toLocaleDateString()}</span>
                {dispute.responseReason && (
                  <span className="text-accent">Has response</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
