'use client'

import { useState, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import Link from 'next/link'
import { useAuth } from '../hooks/useAuth'
import {
  createTransferProposalWA,
  approveAndExecuteWA,
} from '@/lib/solana/multisig'

interface PlatformConfig {
  arbiterWalletAddress: string | null
  platformFeeBps: number
}

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
  bidderUsername?: string | null
  bidderProfilePic?: string | null
  isCreator: boolean
  isBidder: boolean
  taskType?: string
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
  bidderUsername,
  bidderProfilePic,
  isCreator,
  isBidder,
  taskType = 'QUOTE',
  onUpdate,
}: MultisigActionsProps) {
  const { authFetch, wallet: authWallet } = useAuth()
  const { connection } = useConnection()
  const wallet = useWallet()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [config, setConfig] = useState<PlatformConfig | null>(null)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeLoading, setDisputeLoading] = useState(false)

  // Fetch platform config on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.config) {
          setConfig({
            arbiterWalletAddress: data.config.arbiterWalletAddress,
            platformFeeBps: data.config.platformFeeBps,
          })
        }
      })
      .catch(() => {})
  }, [])

  /** Bidder: create proposal + self-approve on-chain, then record in DB */
  const handleRequestPayment = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !multisigAddress) return
    if (!config?.arbiterWalletAddress) {
      setStatus('Error: Platform wallet address not configured. Cannot create payment proposal.')
      return
    }
    setLoading(true)
    setStatus('Creating payment proposal on-chain...')
    try {
      const multisigPda = new PublicKey(multisigAddress)
      const recipient = wallet.publicKey // bidder pays themselves
      const platformWallet = new PublicKey(config.arbiterWalletAddress)

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

  /** Either party: raise a dispute by creating a proposal to pay themselves */
  const handleRaiseDispute = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !multisigAddress) return
    if (!config?.arbiterWalletAddress) {
      setStatus('Error: Platform wallet address not configured.')
      return
    }
    if (disputeReason.length < 10) {
      setStatus('Please provide a reason (at least 10 characters)')
      return
    }

    setDisputeLoading(true)
    setStatus('Creating dispute proposal on-chain...')
    try {
      const multisigPda = new PublicKey(multisigAddress)
      // Disputant wants funds released to themselves
      const recipient = wallet.publicKey
      const platformWallet = new PublicKey(config.arbiterWalletAddress)

      const { transactionIndex, signature } = await createTransferProposalWA(
        connection,
        { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        multisigPda,
        recipient,
        Number(amountLamports),
        `slopwork-dispute-${taskId}`,
        platformWallet
      )

      setStatus('Recording dispute...')
      const res = await authFetch(`/api/tasks/${taskId}/bids/${bidId}/dispute`, {
        method: 'POST',
        body: JSON.stringify({
          proposalIndex: Number(transactionIndex),
          txSignature: signature,
          reason: disputeReason,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus('Dispute raised! The platform arbiter will review your case.')
        setShowDisputeModal(false)
        setDisputeReason('')
        onUpdate()
      } else {
        setStatus(data.message || 'Failed to raise dispute')
      }
    } catch (e: any) {
      console.error('Raise dispute error:', e)
      setStatus(e.message || 'Failed to create dispute proposal')
    } finally {
      setDisputeLoading(false)
    }
  }

  const totalLamports = Number(amountLamports)
  const solAmount = (totalLamports / LAMPORTS_PER_SOL).toFixed(4)
  const bidderPayout = (Math.floor(totalLamports * 0.9) / LAMPORTS_PER_SOL).toFixed(4)
  const platformFee = (Math.floor(totalLamports * 0.1) / LAMPORTS_PER_SOL).toFixed(4)

  return (
    <div className="space-y-3 rounded-xl border border-k-border p-4">
      <h3 className="text-sm font-semibold text-white">Escrow Actions</h3>

      {multisigAddress && (
        <div className="text-xs text-zinc-500 space-y-1">
          <p>Multisig: {multisigAddress.slice(0, 8)}...{multisigAddress.slice(-8)}</p>
          {vaultAddress && <p>Vault: {vaultAddress.slice(0, 8)}...{vaultAddress.slice(-8)}</p>}
          <p>Escrow: {solAmount} SOL (bidder: {bidderPayout} / platform: {platformFee})</p>
          <p className="flex items-center gap-1.5">
            Bidder:{' '}
            <Link href={`/u/${bidderWallet}`} className="inline-flex items-center gap-1.5 hover:text-zinc-300">
              {bidderProfilePic ? (
                <img src={bidderProfilePic} alt="" className="inline h-5 w-5 rounded-full object-cover" />
              ) : (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[8px] font-medium text-zinc-400 bg-zinc-700 text-zinc-300">
                  {bidderWallet.slice(0, 2)}
                </span>
              )}
              {bidderUsername || `${bidderWallet.slice(0, 6)}...${bidderWallet.slice(-4)}`}
            </Link>
          </p>
        </div>
      )}

      {/* Status indicator */}
      <div className="rounded-lg bg-surface px-3 py-2 text-xs">
        {bidStatus === 'ACCEPTED' && taskType === 'QUOTE' && (
          <p className="text-blue-400">
            Bid accepted. {isCreator ? 'Fund the escrow vault to proceed.' : 'Waiting for task creator to fund the escrow vault.'}
          </p>
        )}
        {bidStatus === 'ACCEPTED' && taskType === 'COMPETITION' && (
          <p className="text-blue-400">
            Submission selected. {isCreator ? 'Fund the vault and approve payment to complete.' : 'Waiting for task creator to fund and release payment.'}
          </p>
        )}
        {bidStatus === 'FUNDED' && (
          <p className="text-blue-400">
            Vault funded. {isBidder ? 'Submit deliverables and request payment.' : 'Waiting for bidder to complete the task.'}
          </p>
        )}
        {bidStatus === 'PAYMENT_REQUESTED' && (
          <p className="text-amber-400">
            Payment requested (proposal #{proposalIndex}).{' '}
            {isCreator ? 'Review and approve to release funds.' : 'Waiting for task creator approval.'}
          </p>
        )}
        {bidStatus === 'COMPLETED' && (
          <p className="text-green-400">
            Payment released! Task completed.
            {paymentTxSig && (
              <> Tx: {paymentTxSig.slice(0, 8)}...{paymentTxSig.slice(-8)}</>
            )}
          </p>
        )}
        {bidStatus === 'DISPUTED' && (
          <p className="text-red-400">
            This task is under dispute. An arbiter will intervene.
          </p>
        )}
      </div>

      {/* Bidder: Request Payment (when vault is funded, quote mode only -- competition creates proposal at submission time) */}
      {isBidder && bidStatus === 'FUNDED' && taskType === 'QUOTE' && (
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
          <button
            onClick={() => setShowDisputeModal(true)}
            className="underline text-red-500 hover:text-red-600"
            disabled={loading || disputeLoading}
          >
            Request Arbitration
          </button>
        </p>
      )}

      {status && (
        <p className="text-xs text-zinc-400 break-all">{status}</p>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-surface p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Request Arbitration
            </h3>
            <p className="mb-4 text-sm text-zinc-400">
              By raising a dispute, you are requesting the platform arbiter to review this task
              and decide how funds should be released. Please explain your issue clearly.
            </p>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Explain why you are raising this dispute (min 10 characters)..."
              className="mb-4 h-32 w-full rounded-lg border border-k-border bg-surface px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 focus:border-accent/50 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDisputeModal(false)
                  setDisputeReason('')
                  setStatus('')
                }}
                disabled={disputeLoading}
                className="flex-1 rounded-lg border border-k-border py-2 text-sm font-medium text-zinc-300 hover:bg-surface-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRaiseDispute}
                disabled={disputeLoading || disputeReason.length < 10}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {disputeLoading ? 'Processing...' : 'Raise Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
