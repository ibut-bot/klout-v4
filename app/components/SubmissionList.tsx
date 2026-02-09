'use client'

import { useState } from 'react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'
import { approveAndExecuteWA, createProposalApproveExecuteWA } from '@/lib/solana/multisig'
import Link from 'next/link'

const PLATFORM_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS || ''

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(2)} SOL`
}

interface Attachment {
  url: string
  key?: string
  contentType?: string
  size?: number
  filename?: string
}

interface SubmissionBid {
  id: string
  bidderId: string
  amountLamports: string
  multisigAddress: string | null
  vaultAddress: string | null
  proposalIndex: number | null
  status: string
  bidderWallet: string
  bidderUsername?: string | null
  bidderProfilePic?: string | null
}

interface Submission {
  id: string
  bidId: string
  description: string
  attachments: Attachment[] | null
  createdAt: string
  bid?: SubmissionBid
}

interface SubmissionListProps {
  submissions: Submission[]
  isCreator: boolean
  taskId: string
  taskType: string
  taskStatus: string
  taskMultisigAddress?: string | null
  taskVaultAddress?: string | null
  onWinnerSelected?: () => void
}

export default function SubmissionList({
  submissions,
  isCreator,
  taskId,
  taskType,
  taskStatus,
  taskMultisigAddress,
  taskVaultAddress,
  onWinnerSelected,
}: SubmissionListProps) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const { publicKey, sendTransaction, signTransaction } = useWallet()
  const [selectingBidId, setSelectingBidId] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'accepting' | 'funding' | 'approving' | 'paying'>('idle')
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [retryBidId, setRetryBidId] = useState<string | null>(null)

  const isCompetition = taskType === 'COMPETITION'

  const handleSelectWinner = async (bid: SubmissionBid) => {
    if (!publicKey || !signTransaction) return
    setSelectingBidId(bid.id)
    setPaymentError(null)

    try {
      if (isCompetition) {
        // New competition flow: accept bid, then create proposal+approve+execute from task vault
        // Step 1: Accept bid on API
        setStep('accepting')
        const acceptRes = await authFetch(`/api/tasks/${taskId}/bids/${bid.id}/accept`, { method: 'POST' })
        const acceptData = await acceptRes.json()
        if (!acceptData.success) throw new Error(acceptData.message)

        // Step 2: Create proposal + approve + execute on-chain from the task-level vault
        await payWinner(bid)
      } else {
        // Legacy quote flow: accept → fund → approve
        setStep('accepting')
        const acceptRes = await authFetch(`/api/tasks/${taskId}/bids/${bid.id}/accept`, { method: 'POST' })
        const acceptData = await acceptRes.json()
        if (!acceptData.success) throw new Error(acceptData.message)

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

          await authFetch(`/api/tasks/${taskId}/bids/${bid.id}/fund`, {
            method: 'POST',
            body: JSON.stringify({ fundingTxSignature: signature }),
          })

          if (bid.multisigAddress && bid.proposalIndex !== undefined && bid.proposalIndex !== null) {
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

        onWinnerSelected?.()
      }
    } catch (e: any) {
      console.error('Select winner failed:', e)
      // For competition, if accept succeeded but payment failed, show retry
      if (isCompetition && step === 'paying') {
        setPaymentError(e.message || 'Payment failed')
        setRetryBidId(bid.id)
      }
      onWinnerSelected?.()
    } finally {
      setSelectingBidId(null)
      setStep('idle')
    }
  }

  /** Attempt to pay the winner from the task vault (competition mode) */
  const payWinner = async (bid: SubmissionBid) => {
    if (!publicKey || !signTransaction || !taskMultisigAddress || !PLATFORM_WALLET) return

    setStep('paying')
    const multisigPda = new PublicKey(taskMultisigAddress)
    const winnerWallet = new PublicKey(bid.bidderWallet)
    const lamports = Number(bid.amountLamports)

    const { signature } = await createProposalApproveExecuteWA(
      connection,
      { publicKey, signTransaction },
      multisigPda,
      winnerWallet,
      lamports,
      new PublicKey(PLATFORM_WALLET),
      `slopwork-payout-${taskId}`,
    )

    // Record payment on API
    const payRes = await authFetch(`/api/tasks/${taskId}/bids/${bid.id}/approve-payment`, {
      method: 'POST',
      body: JSON.stringify({ paymentTxSignature: signature }),
    })
    const payData = await payRes.json()
    if (!payData.success) throw new Error(payData.message)

    setPaymentError(null)
    setRetryBidId(null)
    onWinnerSelected?.()
  }

  const handleRetryPayment = async (bid: SubmissionBid) => {
    if (!publicKey || !signTransaction) return
    setSelectingBidId(bid.id)
    setPaymentError(null)
    try {
      await payWinner(bid)
    } catch (e: any) {
      console.error('Retry payment failed:', e)
      setPaymentError(e.message || 'Payment failed')
      setRetryBidId(bid.id)
      onWinnerSelected?.()
    } finally {
      setSelectingBidId(null)
      setStep('idle')
    }
  }

  if (submissions.length === 0) {
    return <p className="text-sm text-zinc-500">No submissions yet.</p>
  }

  const isImage = (ct?: string) => ct?.startsWith('image/')
  const isVideo = (ct?: string) => ct?.startsWith('video/')

  const getButtonText = (bidId: string) => {
    if (selectingBidId !== bidId) return null
    if (step === 'accepting') return 'Accepting...'
    if (step === 'funding') return 'Funding vault...'
    if (step === 'approving') return 'Approving payment...'
    if (step === 'paying') return 'Processing payment...'
    return 'Processing...'
  }

  return (
    <div className="space-y-4">
      {submissions.map((sub) => {
        const canSelect = isCompetition && isCreator && taskStatus === 'OPEN' && sub.bid && sub.bid.status === 'PENDING'
        const canRetry = isCompetition && isCreator && retryBidId === sub.bid?.id && paymentError

        return (
          <div
            key={sub.id}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            {/* Bidder info */}
            {sub.bid && (
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link href={`/u/${sub.bid.bidderWallet}`} className="flex items-center gap-1.5 hover:opacity-80">
                    {sub.bid.bidderProfilePic ? (
                      <img src={sub.bid.bidderProfilePic} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        {sub.bid.bidderWallet.slice(0, 2)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {sub.bid.bidderUsername || `${sub.bid.bidderWallet.slice(0, 4)}...${sub.bid.bidderWallet.slice(-4)}`}
                    </span>
                  </Link>
                  <span className="text-sm text-zinc-500">{formatSol(sub.bid.amountLamports)}</span>
                </div>
                <span className="text-xs text-zinc-400">
                  {new Date(sub.createdAt).toLocaleDateString()}
                </span>
              </div>
            )}

            {/* Description */}
            <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {sub.description}
            </p>

            {/* Attachments */}
            {sub.attachments && sub.attachments.length > 0 && (
              <div className="mb-3 space-y-2">
                <p className="text-xs font-medium text-zinc-500">Attachments ({sub.attachments.length})</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sub.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
                    >
                      {isImage(att.contentType) ? (
                        <img src={att.url} alt={att.filename || ''} className="h-32 w-full object-cover" />
                      ) : isVideo(att.contentType) ? (
                        <video src={att.url} className="h-32 w-full object-cover" />
                      ) : (
                        <div className="flex h-32 items-center justify-center bg-zinc-50 dark:bg-zinc-900">
                          <span className="text-xs text-zinc-500">{att.filename || 'File'}</span>
                        </div>
                      )}
                      <div className="px-2 py-1.5">
                        <p className="truncate text-xs text-zinc-600 group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-200">
                          {att.filename || 'Download'}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Payment error + retry for competition */}
            {canRetry && sub.bid && (
              <div className="mb-3 space-y-2">
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  Payment failed: {paymentError}
                </div>
                <button
                  onClick={() => handleRetryPayment(sub.bid!)}
                  disabled={selectingBidId !== null}
                  className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {selectingBidId === sub.bid.id
                    ? getButtonText(sub.bid.id)
                    : `Retry Payment (${formatSol(sub.bid.amountLamports)})`}
                </button>
              </div>
            )}

            {/* Select winner button (competition mode, creator only) */}
            {canSelect && sub.bid && (
              <button
                onClick={() => handleSelectWinner(sub.bid!)}
                disabled={selectingBidId !== null}
                className="mt-2 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {selectingBidId === sub.bid.id
                  ? getButtonText(sub.bid.id)
                  : `Select Winner & Pay (${formatSol(sub.bid.amountLamports)})`}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
