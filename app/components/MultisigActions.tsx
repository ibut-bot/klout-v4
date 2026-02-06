'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import {
  createTransferProposalWA,
  approveAndExecuteWA,
} from '@/lib/solana/multisig'

interface MultisigActionsProps {
  taskId: string
  bidId: string
  bidStatus: string
  vaultAddress: string | null
  multisigAddress: string | null
  amountLamports: string
  proposalIndex: number | null
  paymentTxSig: string | null
  bidderWallet: string
  isCreator: boolean
  isBidder: boolean
  onUpdate: () => void
}

export default function MultisigActions({
  taskId,
  bidId,
  bidStatus,
  vaultAddress,
  multisigAddress,
  amountLamports,
  proposalIndex,
  paymentTxSig,
  bidderWallet,
  isCreator,
  isBidder,
  onUpdate,
}: MultisigActionsProps) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const wallet = useWallet()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  /** Bidder: create proposal + self-approve on-chain, then record in DB */
  const handleRequestPayment = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !multisigAddress) return
    setLoading(true)
    setStatus('Creating payment proposal on-chain...')
    try {
      const multisigPda = new PublicKey(multisigAddress)
      const recipient = wallet.publicKey // bidder pays themselves
      const platformAddr = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS
      const platformWallet = platformAddr ? new PublicKey(platformAddr) : undefined

      const { transactionIndex, signature } = await createTransferProposalWA(
        connection,
        { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        multisigPda,
        recipient,
        Number(amountLamports),
        `slopwork-task-${taskId}`,
        platformWallet
      )

      setStatus('Recording payment request...')
      const res = await authFetch(`/api/tasks/${taskId}/bids/${bidId}/request-payment`, {
        method: 'POST',
        body: JSON.stringify({
          proposalIndex: Number(transactionIndex),
          txSignature: signature,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus('Payment requested! Waiting for task creator approval.')
        onUpdate()
      } else {
        setStatus(data.message || 'Failed to record payment request')
      }
    } catch (e: any) {
      console.error('Request payment error:', e)
      setStatus(e.message || 'Failed to create payment proposal')
    } finally {
      setLoading(false)
    }
  }

  /** Creator: approve on-chain + execute vault tx, then record in DB */
  const handleApprovePayment = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !multisigAddress || proposalIndex === null) return
    setLoading(true)
    setStatus('Approving payment on-chain...')
    try {
      const multisigPda = new PublicKey(multisigAddress)
      const txIndex = BigInt(proposalIndex)

      setStatus('Approving & executing payment...')
      const executeSig = await approveAndExecuteWA(
        connection,
        { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        multisigPda,
        txIndex
      )
      const approveSig = executeSig // single tx covers both

      setStatus('Recording completion...')
      const res = await authFetch(`/api/tasks/${taskId}/bids/${bidId}/approve-payment`, {
        method: 'POST',
        body: JSON.stringify({
          approveTxSignature: approveSig,
          executeTxSignature: executeSig,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus('Payment released! Task completed.')
        onUpdate()
      } else {
        setStatus(data.message || 'Failed to record approval')
      }
    } catch (e: any) {
      console.error('Approve payment error:', e)
      setStatus(e.message || 'Failed to approve payment')
    } finally {
      setLoading(false)
    }
  }

  const totalLamports = Number(amountLamports)
  const solAmount = (totalLamports / LAMPORTS_PER_SOL).toFixed(4)
  const bidderPayout = (Math.floor(totalLamports * 0.9) / LAMPORTS_PER_SOL).toFixed(4)
  const platformFee = (Math.floor(totalLamports * 0.1) / LAMPORTS_PER_SOL).toFixed(4)

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Escrow Actions</h3>

      {multisigAddress && (
        <div className="text-xs text-zinc-500 space-y-1">
          <p>Multisig: {multisigAddress.slice(0, 8)}...{multisigAddress.slice(-8)}</p>
          {vaultAddress && <p>Vault: {vaultAddress.slice(0, 8)}...{vaultAddress.slice(-8)}</p>}
          <p>Escrow: {solAmount} SOL (bidder: {bidderPayout} / platform: {platformFee})</p>
          <p>Bidder: {bidderWallet.slice(0, 6)}...{bidderWallet.slice(-4)}</p>
        </div>
      )}

      {/* Status indicator */}
      <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900">
        {bidStatus === 'FUNDED' && (
          <p className="text-blue-600 dark:text-blue-400">
            Vault funded. {isBidder ? 'Complete the task and request payment.' : 'Waiting for bidder to complete the task.'}
          </p>
        )}
        {bidStatus === 'PAYMENT_REQUESTED' && (
          <p className="text-amber-600 dark:text-amber-400">
            Payment requested (proposal #{proposalIndex}).{' '}
            {isCreator ? 'Review and approve to release funds.' : 'Waiting for task creator approval.'}
          </p>
        )}
        {bidStatus === 'COMPLETED' && (
          <p className="text-green-600 dark:text-green-400">
            Payment released! Task completed.
            {paymentTxSig && (
              <> Tx: {paymentTxSig.slice(0, 8)}...{paymentTxSig.slice(-8)}</>
            )}
          </p>
        )}
        {bidStatus === 'DISPUTED' && (
          <p className="text-red-600 dark:text-red-400">
            This task is under dispute. An arbiter will intervene.
          </p>
        )}
      </div>

      {/* Bidder: Request Payment (when vault is funded) */}
      {isBidder && bidStatus === 'FUNDED' && (
        <button
          onClick={handleRequestPayment}
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Request Payment'}
        </button>
      )}

      {/* Creator: Approve & Release Payment (when payment is requested) */}
      {isCreator && bidStatus === 'PAYMENT_REQUESTED' && (
        <button
          onClick={handleApprovePayment}
          disabled={loading}
          className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Approve & Release Payment'}
        </button>
      )}

      {/* Dispute option -- either party can raise if FUNDED or PAYMENT_REQUESTED */}
      {(isCreator || isBidder) && ['FUNDED', 'PAYMENT_REQUESTED'].includes(bidStatus) && (
        <p className="text-xs text-zinc-400 text-center">
          Having issues?{' '}
          <button className="underline text-red-500 hover:text-red-600" disabled>
            Request Arbitration
          </button>{' '}
          (coming soon)
        </p>
      )}

      {status && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400 break-all">{status}</p>
      )}
    </div>
  )
}
