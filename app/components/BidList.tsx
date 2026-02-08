'use client'

import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(2)} SOL`
}
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'
import { useState } from 'react'

interface Bid {
  id: string
  bidderWallet: string
  bidderProfilePic?: string | null
  amountLamports: string
  description: string
  multisigAddress: string | null
  vaultAddress: string | null
  status: string
  createdAt: string
}

interface BidListProps {
  bids: Bid[]
  taskId: string
  isCreator: boolean
  taskStatus: string
  onBidAccepted?: () => void
}

const BID_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REJECTED: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
  FUNDED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

export default function BidList({ bids, taskId, isCreator, taskStatus, onBidAccepted }: BidListProps) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [accepting, setAccepting] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'accepting' | 'funding'>('idle')

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
      {bids.map((bid) => (
        <div key={bid.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {formatSol(bid.amountLamports)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BID_STATUS_COLORS[bid.status] || ''}`}>
                {bid.status}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {bid.bidderProfilePic ? (
                <img src={bid.bidderProfilePic} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                  {bid.bidderWallet.slice(0, 2)}
                </div>
              )}
              <span className="text-xs text-zinc-400" title={bid.bidderWallet}>
                {bid.bidderWallet.slice(0, 4)}...{bid.bidderWallet.slice(-4)}
              </span>
            </div>
          </div>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{bid.description}</p>
          {bid.multisigAddress && (
            <p className="mb-2 text-xs text-zinc-400">
              Escrow: {bid.multisigAddress.slice(0, 8)}...{bid.multisigAddress.slice(-8)}
            </p>
          )}
          {isCreator && taskStatus === 'OPEN' && bid.status === 'PENDING' && (
            <button
              onClick={() => handleAcceptAndFund(bid)}
              disabled={accepting === bid.id}
              className="mt-1 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {accepting === bid.id
                ? step === 'funding'
                  ? 'Funding vault...'
                  : 'Accepting...'
                : `Accept & Fund (${formatSol(bid.amountLamports)})`}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
