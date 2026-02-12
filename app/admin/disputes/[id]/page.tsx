'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '../../../hooks/useAuth'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js'
import * as multisig from '@sqds/multisig'
import Link from 'next/link'

const ARBITER_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS

interface DisputeDetail {
  id: string
  raisedBy: 'CREATOR' | 'BIDDER'
  raisedByWallet: string
  proposalIndex: number
  proposalTxSig: string
  reason: string
  evidenceUrls: string[]
  status: 'PENDING' | 'ACCEPTED' | 'DENIED'
  responseReason: string | null
  responseEvidence: string[]
  resolutionNotes: string | null
  resolvedByWallet: string | null
  resolveTxSig: string | null
  executeTxSig: string | null
  createdAt: string
  resolvedAt: string | null
}

interface TaskInfo {
  id: string
  title: string
  description: string
  status: string
  budgetLamports: string
  creator: { id: string; walletAddress: string; profilePicUrl: string | null }
}

interface BidInfo {
  id: string
  amountLamports: string
  description: string
  status: string
  multisigAddress: string | null
  vaultAddress: string | null
  proposalIndex: number | null
  bidder: { id: string; walletAddress: string; profilePicUrl: string | null }
}

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(4)} SOL`
}

function shortenWallet(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-500/20 text-amber-400',
  ACCEPTED: 'bg-green-500/20 text-green-400',
  DENIED: 'bg-red-500/20 text-red-400',
}

export default function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { wallet, isAuthenticated, authFetch } = useAuth()
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()

  const [dispute, setDispute] = useState<DisputeDetail | null>(null)
  const [task, setTask] = useState<TaskInfo | null>(null)
  const [bid, setBid] = useState<BidInfo | null>(null)
  const [isArbiter, setIsArbiter] = useState(false)
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchDispute = useCallback(async () => {
    try {
      const res = await authFetch(`/api/disputes/${id}`)
      const data = await res.json()
      if (data.success) {
        setDispute(data.dispute)
        setTask(data.task)
        setBid(data.bid)
        setIsArbiter(data.isArbiter)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [authFetch, id])

  useEffect(() => {
    if (isAuthenticated) {
      fetchDispute()
    }
  }, [isAuthenticated, fetchDispute])

  const handleResolve = async (decision: 'ACCEPT' | 'DENY') => {
    if (!dispute || !bid || !signTransaction || !publicKey) return
    setResolving(true)
    setError(null)

    try {
      let approveTxSignature = ''
      let executeTxSignature = ''

      if (decision === 'ACCEPT') {
        // Need to approve and execute the on-chain proposal
        if (!bid.multisigAddress) {
          throw new Error('No multisig address found')
        }

        const multisigPda = new PublicKey(bid.multisigAddress)
        const transactionIndex = BigInt(dispute.proposalIndex)

        // Approve the proposal
        const approveIx = multisig.instructions.proposalApprove({
          multisigPda,
          transactionIndex,
          member: publicKey,
        })

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
        const approveTx = new Transaction()
        approveTx.recentBlockhash = blockhash
        approveTx.feePayer = publicKey
        approveTx.add(approveIx)

        const signedApproveTx = await signTransaction(approveTx)
        approveTxSignature = await connection.sendRawTransaction(signedApproveTx.serialize(), { maxRetries: 5 })
        await connection.confirmTransaction({ signature: approveTxSignature, blockhash, lastValidBlockHeight }, 'confirmed')

        // Execute the vault transaction
        const executeResult = await multisig.instructions.vaultTransactionExecute({
          connection,
          multisigPda,
          transactionIndex,
          member: publicKey,
        })

        const { blockhash: execBlockhash, lastValidBlockHeight: execLastValid } = await connection.getLatestBlockhash()
        const executeTx = new Transaction()
        executeTx.recentBlockhash = execBlockhash
        executeTx.feePayer = publicKey
        executeTx.add(executeResult.instruction)

        const signedExecuteTx = await signTransaction(executeTx)
        executeTxSignature = await connection.sendRawTransaction(signedExecuteTx.serialize(), { maxRetries: 5 })
        await connection.confirmTransaction({ signature: executeTxSignature, blockhash: execBlockhash, lastValidBlockHeight: execLastValid }, 'confirmed')
      }

      // Record the resolution on the API
      const res = await authFetch(`/api/disputes/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          resolutionNotes: resolutionNotes || undefined,
          approveTxSignature: approveTxSignature || undefined,
          executeTxSignature: executeTxSignature || undefined,
        }),
      })

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message)
      }

      // Refresh the dispute
      await fetchDispute()
    } catch (e: any) {
      setError(e.message || 'Failed to resolve dispute')
    } finally {
      setResolving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-8 w-64 animate-pulse rounded bg-surface mb-4" />
        <div className="h-64 animate-pulse rounded-xl bg-surface" />
      </div>
    )
  }

  if (!dispute || !task || !bid) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Dispute Not Found</h1>
        <Link href="/admin/disputes" className="text-accent hover:underline">
          Back to disputes
        </Link>
      </div>
    )
  }

  const isArbiterWallet = wallet === ARBITER_WALLET
  const canResolve = isArbiterWallet && dispute.status === 'PENDING'

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/disputes" className="text-sm text-zinc-500 hover:text-zinc-300 mb-2 inline-block">
          ← Back to disputes
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Dispute Resolution</h1>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_BADGE[dispute.status]}`}>
            {dispute.status}
          </span>
        </div>
      </div>

      {/* Task Info */}
      <section className="mb-6 rounded-xl border border-k-border p-5">
        <h2 className="font-semibold text-zinc-100 mb-3">Task Details</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Title</span>
            <Link href={`/tasks/${task.id}`} className="text-accent hover:underline truncate max-w-xs">
              {task.title}
            </Link>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Budget</span>
            <span className="text-zinc-100">{formatSol(task.budgetLamports)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Creator</span>
            <Link href={`/u/${task.creator.walletAddress}`} className="font-mono text-xs text-zinc-100 hover:text-accent">
              {shortenWallet(task.creator.walletAddress)}
            </Link>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Escrow Amount</span>
            <span className="text-zinc-100 font-semibold">{formatSol(bid.amountLamports)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Bidder</span>
            <Link href={`/u/${bid.bidder.walletAddress}`} className="font-mono text-xs text-zinc-100 hover:text-accent">
              {shortenWallet(bid.bidder.walletAddress)}
            </Link>
          </div>
          {bid.multisigAddress && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Multisig</span>
              <a
                href={`https://solscan.io/account/${bid.multisigAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-accent hover:underline"
              >
                {shortenWallet(bid.multisigAddress)}
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Disputant's Claim */}
      <section className="mb-6 rounded-xl border border-k-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-zinc-100">
            {dispute.raisedBy === 'CREATOR' ? 'Creator' : 'Bidder'}&apos;s Claim
          </h2>
          <span className="text-xs text-zinc-500">(Disputant)</span>
        </div>
        <p className="text-sm text-zinc-300 mb-3 whitespace-pre-wrap">
          {dispute.reason}
        </p>
        {dispute.evidenceUrls.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-zinc-500 mb-1">Evidence:</p>
            <ul className="space-y-1">
              {dispute.evidenceUrls.map((url, i) => (
                <li key={i}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline break-all">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 pt-3 border-t border-k-border flex items-center gap-4 text-xs text-zinc-500">
          <span>Proposal #{dispute.proposalIndex}</span>
          <a
            href={`https://solscan.io/tx/${dispute.proposalTxSig}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            View on Solscan
          </a>
        </div>
      </section>

      {/* Respondent's Response */}
      <section className="mb-6 rounded-xl border border-k-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-zinc-100">
            {dispute.raisedBy === 'CREATOR' ? 'Bidder' : 'Creator'}&apos;s Response
          </h2>
          <span className="text-xs text-zinc-500">(Respondent)</span>
        </div>
        {dispute.responseReason ? (
          <>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">
              {dispute.responseReason}
            </p>
            {dispute.responseEvidence.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-zinc-500 mb-1">Evidence:</p>
                <ul className="space-y-1">
                  {dispute.responseEvidence.map((url, i) => (
                    <li key={i}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline break-all">
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500 italic">No response submitted yet.</p>
        )}
      </section>

      {/* Resolution Section */}
      {dispute.status !== 'PENDING' ? (
        <section className="rounded-xl border border-k-border p-5 bg-surface/50">
          <h2 className="font-semibold text-zinc-100 mb-3">Resolution</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Decision</span>
              <span className={dispute.status === 'ACCEPTED' ? 'text-green-400' : 'text-red-400'}>
                {dispute.status}
              </span>
            </div>
            {dispute.resolutionNotes && (
              <div>
                <span className="text-zinc-500 block mb-1">Notes</span>
                <p className="text-zinc-300">{dispute.resolutionNotes}</p>
              </div>
            )}
            {dispute.executeTxSig && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Execute TX</span>
                <a
                  href={`https://solscan.io/tx/${dispute.executeTxSig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline font-mono text-xs"
                >
                  View on Solscan
                </a>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-zinc-500">Resolved</span>
              <span className="text-zinc-100">
                {dispute.resolvedAt ? new Date(dispute.resolvedAt).toLocaleString() : '-'}
              </span>
            </div>
          </div>
        </section>
      ) : canResolve ? (
        <section className="rounded-xl border border-k-border p-5">
          <h2 className="font-semibold text-zinc-100 mb-4">Resolve Dispute</h2>

          <div className="mb-4">
            <label className="block text-sm text-zinc-400 mb-1">
              Resolution Notes (optional)
            </label>
            <textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Explain your decision..."
              className="w-full rounded-lg border border-k-border bg-surface px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400"
              rows={3}
            />
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => handleResolve('ACCEPT')}
              disabled={resolving}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resolving ? 'Processing...' : 'Accept & Release Funds'}
            </button>
            <button
              onClick={() => handleResolve('DENY')}
              disabled={resolving}
              className="flex-1 rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resolving ? 'Processing...' : 'Deny Dispute'}
            </button>
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            <strong>Accept:</strong> Signs the disputant&apos;s proposal, releasing funds to them.{' '}
            <strong>Deny:</strong> Rejects the dispute with no on-chain action.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-k-border p-5 text-center">
          <p className="text-sm text-zinc-500">
            {!isArbiterWallet
              ? 'Only the platform arbiter can resolve disputes.'
              : 'This dispute is awaiting resolution.'}
          </p>
        </section>
      )}
    </div>
  )
}
