'use client'

import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import Link from 'next/link'

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(2)} SOL`
}
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'
import { approveAndExecuteWA } from '@/lib/solana/multisig'
import { useState } from 'react'

interface Bid {
  id: string
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

interface BidListProps {
  bids: Bid[]
  taskId: string
  isCreator: boolean
  taskStatus: string
  taskType?: string
  onBidAccepted?: () => void
  selectedBidId?: string | null
  onBidSelect?: (bidderId: string) => void
}

const BID_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  ACCEPTED: 'bg-green-500/20 text-green-400',
  REJECTED: 'bg-zinc-700/50 text-zinc-500',
  FUNDED: 'bg-blue-500/20 text-blue-400',
  COMPLETED: 'bg-green-500/20 text-green-400',
}

export default function BidList({ bids, taskId, isCreator, taskStatus, taskType = 'QUOTE', onBidAccepted, selectedBidId, onBidSelect }: BidListProps) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const { publicKey, sendTransaction, signTransaction } = useWallet()
  const [accepting, setAccepting] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'accepting' | 'funding' | 'approving'>('idle')

  const isCompetition = taskType === 'COMPETITION'

  const handleAcceptAndFund = async (bid: Bid) => {
    if (!publicKey) return
    setAccepting(bid.id)

    try {
      // Step 1: Accept bid on the API
      setStep('accepting')
      const acceptRes = await authFetch(`/api/tasks/${taskId}/bids/${bid.id}/accept`, { method: 'POST' })
      const acceptData = await acceptRes.json()
      if (!acceptData.success) throw new Error(acceptData.message)

      // Step 2: Fund the vault on-chain
      if (bid.vaultAddress) {
        setStep('funding')
        const lamports = Number(bid.amountLamports)
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
        const tx = new Transaction()
        tx.recentBlockhash = blockhash
        tx.feePayer = publicKey
        tx.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(bid.vaultAddress),
            lamports,
          })
        )

        const signature = await sendTransaction(tx, connection)
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

        // Record funding on API
        await authFetch(`/api/tasks/${taskId}/bids/${bid.id}/fund`, {
          method: 'POST',
          body: JSON.stringify({ fundingTxSignature: signature }),
        })

        // For competition mode, also approve the existing payment proposal
        if (isCompetition && bid.multisigAddress && bid.proposalIndex !== undefined && bid.proposalIndex !== null && signTransaction) {
          setStep('approving')
          const multisigPda = new PublicKey(bid.multisigAddress)
          const txIndex = BigInt(bid.proposalIndex)

          const executeSig = await approveAndExecuteWA(
            connection,
            { publicKey, signTransaction },
            multisigPda,
            txIndex
          )

          await authFetch(`/api/tasks/${taskId}/bids/${bid.id}/approve-payment`, {
            method: 'POST',
            body: JSON.stringify({
              approveTxSignature: executeSig,
              executeTxSignature: executeSig,
            }),
          })
        }
      }

      onBidAccepted?.()
    } catch (e: any) {
      console.error('Accept & fund failed:', e)
      // Still refresh -- the accept may have succeeded even if funding failed
      onBidAccepted?.()
    } finally {
      setAccepting(null)
      setStep('idle')
    }
  }

  if (bids.length === 0) {
    return <p className="text-sm text-zinc-500">No bids yet.</p>
  }

  return (
    <div className="space-y-3">
      {bids.map((bid) => {
        // For competition mode, winner selection happens in SubmissionList, not here
        const canAccept = isCreator && taskStatus === 'OPEN' && bid.status === 'PENDING' && !isCompetition

        return (
          <div
            key={bid.id}
            onClick={() => onBidSelect?.(bid.id)}
            className={`rounded-xl border p-4 transition-colors ${
              onBidSelect ? 'cursor-pointer hover:border-k-border-hover hover:border-k-border-hover' : ''
            } ${
              selectedBidId === bid.id
                ? 'border-accent bg-surface'
                : 'border-k-border'
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-100">
                  {formatSol(bid.amountLamports)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BID_STATUS_COLORS[bid.status] || ''}`}>
                  {bid.status}
                </span>
                {isCompetition && bid.hasSubmission && (
                  <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400">
                    Submitted
                  </span>
                )}
              </div>
              <Link href={`/u/${bid.bidderWallet}`} className="flex items-center gap-1.5 hover:opacity-80">
                {bid.bidderProfilePic ? (
                  <img src={bid.bidderProfilePic} alt="" className="h-[25px] w-[25px] rounded-full object-cover" />
                ) : (
                  <div className="flex h-[25px] w-[25px] items-center justify-center rounded-full bg-zinc-700 text-[10px] font-medium text-zinc-400 bg-zinc-700 text-zinc-300">
                    {bid.bidderWallet.slice(0, 2)}
                  </div>
                )}
                <span className="text-xs text-zinc-400" title={bid.bidderWallet}>
                  {bid.bidderUsername || `${bid.bidderWallet.slice(0, 4)}...${bid.bidderWallet.slice(-4)}`}
                </span>
              </Link>
            </div>
            <p className="mb-3 text-sm text-zinc-400">{bid.description}</p>
            {bid.multisigAddress && (
              <p className="mb-2 text-xs text-zinc-400">
                Escrow: {bid.multisigAddress.slice(0, 8)}...{bid.multisigAddress.slice(-8)}
              </p>
            )}
            {canAccept && (
              <button
                onClick={(e) => { e.stopPropagation(); handleAcceptAndFund(bid) }}
                disabled={accepting === bid.id}
                className="mt-1 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {accepting === bid.id
                  ? step === 'approving'
                    ? 'Approving payment...'
                    : step === 'funding'
                      ? 'Funding vault...'
                      : 'Accepting...'
                  : isCompetition
                    ? `Select Winner & Pay (${formatSol(bid.amountLamports)})`
                    : `Accept & Fund (${formatSol(bid.amountLamports)})`}
              </button>
            )}
            {/* Competition entries always have submissions since bid+submission are combined */}
          </div>
        )
      })}
    </div>
  )
}
