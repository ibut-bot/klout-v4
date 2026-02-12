'use client'

import { useState, useRef, useCallback } from 'react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'
import { approveAndExecuteWA, createProposalApproveExecuteWA } from '@/lib/solana/multisig'
import Link from 'next/link'

const PLATFORM_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS || ''

/** Rewrite external object-storage URLs through our /storage proxy so
 *  the browser treats them as same-origin (avoids CSP / CORS issues). */
function proxyUrl(url: string): string {
  const endpoint = process.env.NEXT_PUBLIC_HETZNER_ENDPOINT_URL || 'https://hel1.your-objectstorage.com'
  const bucket = process.env.NEXT_PUBLIC_HETZNER_BUCKET_NAME || 'openclaw83'
  const prefix = `${endpoint}/${bucket}/`
  if (url.startsWith(prefix)) {
    return '/storage/' + url.slice(prefix.length)
  }
  return url
}

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
  selectedBidId?: string | null
  onSubmissionSelect?: (bidderId: string) => void
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
  selectedBidId,
  onSubmissionSelect,
}: SubmissionListProps) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const { publicKey, sendTransaction, signTransaction } = useWallet()
  const [selectingBidId, setSelectingBidId] = useState<string | null>(null)
  const [step, setStep] = useState<'idle' | 'accepting' | 'funding' | 'approving' | 'paying'>('idle')
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [retryBidId, setRetryBidId] = useState<string | null>(null)
  const [paymentSig, setPaymentSig] = useState<{ bidId: string; signature: string } | null>(null)

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
    setPaymentSig({ bidId: bid.id, signature })
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

  /** Inline video player with error fallback */
  const VideoPlayer = ({ url, filename, className }: { url: string; filename?: string; className?: string }) => {
    const [failed, setFailed] = useState(false)
    const ref = useRef<HTMLVideoElement>(null)

    const onError = useCallback(() => setFailed(true), [])

    if (failed) {
      return (
        <div className={`flex flex-col items-center justify-center gap-2 bg-surface p-4 ${className || ''}`} style={{ minHeight: '120px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            <line x1="1" y1="5" x2="16" y2="19" />
          </svg>
          <p className="text-xs text-zinc-500 text-center">Unsupported codec</p>
          <a href={url} target="_blank" rel="noopener noreferrer" download
            className="text-xs text-blue-500 hover:text-blue-400 underline">
            Download to play
          </a>
        </div>
      )
    }

    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        ref={ref}
        src={proxyUrl(url)}
        controls
        preload="metadata"
        playsInline
        onError={onError}
        className={`w-full bg-black ${className || ''}`}
        style={{ minHeight: '120px' }}
      />
    )
  }

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

        const isSelected = sub.bid && selectedBidId === sub.bid.id

        return (
          <div
            key={sub.id}
            onClick={() => sub.bid && onSubmissionSelect?.(sub.bid.bidderId)}
            className={`rounded-xl border p-4 transition-colors ${
              onSubmissionSelect ? 'cursor-pointer hover:border-k-border-hover hover:border-k-border-hover' : ''
            } ${
              isSelected
                ? 'border-accent bg-surface'
                : 'border-k-border'
            }`}
          >
            {/* Bidder info */}
            {sub.bid && (
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link href={`/u/${sub.bid.bidderWallet}`} className="flex items-center gap-1.5 hover:opacity-80">
                    {sub.bid.bidderProfilePic ? (
                      <img src={sub.bid.bidderProfilePic} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-medium text-zinc-400 bg-zinc-700 text-zinc-300">
                        {sub.bid.bidderWallet.slice(0, 2)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-zinc-100">
                      {sub.bid.bidderUsername || `${sub.bid.bidderWallet.slice(0, 4)}...${sub.bid.bidderWallet.slice(-4)}`}
                    </span>
                  </Link>
                  {!isCompetition && (
                    <span className="text-sm text-zinc-500">{formatSol(sub.bid.amountLamports)}</span>
                  )}
                </div>
                <span className="text-xs text-zinc-400">
                  {new Date(sub.createdAt).toLocaleDateString()}
                </span>
              </div>
            )}

            {/* Description */}
            <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-400">
              {sub.description}
            </p>

            {/* Attachments */}
            {sub.attachments && sub.attachments.length > 0 && (
              <div className="mb-3 space-y-2">
                <p className="text-xs font-medium text-zinc-500">Attachments ({sub.attachments.length})</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {sub.attachments.map((att, i) =>
                    isVideo(att.contentType) ? (
                      <div key={i} className="overflow-hidden rounded-lg border border-k-border" onClick={(e) => e.stopPropagation()}>
                        <VideoPlayer url={att.url} filename={att.filename} />
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="block px-2 py-1.5 hover:bg-surface-hover hover:bg-surface-hover">
                          <p className="truncate text-xs text-zinc-400 hover:text-zinc-200">
                            {att.filename || 'Download'}
                          </p>
                        </a>
                      </div>
                    ) : (
                      <a
                        key={i}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block overflow-hidden rounded-lg border border-k-border"
                      >
                        {isImage(att.contentType) ? (
                          <img src={att.url} alt={att.filename || ''} className="h-32 w-full object-cover" />
                        ) : (
                          <div className="flex h-32 items-center justify-center bg-surface">
                            <span className="text-xs text-zinc-500">{att.filename || 'File'}</span>
                          </div>
                        )}
                        <div className="px-2 py-1.5">
                          <p className="truncate text-xs text-zinc-400 group-hover:text-zinc-200">
                            {att.filename || 'Download'}
                          </p>
                        </div>
                      </a>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Payment success signature (competition) */}
            {sub.bid && paymentSig?.bidId === sub.bid.id && (
              <div className="mb-3 rounded-lg bg-green-500/10 p-3 text-sm text-green-400">
                Payment successful!{' '}
                <a
                  href={`https://orb.helius.dev/tx/${paymentSig.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs underline hover:text-green-200"
                >
                  {paymentSig.signature.slice(0, 8)}...{paymentSig.signature.slice(-8)}
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>
            )}

            {/* Payment error + retry for competition */}
            {canRetry && sub.bid && (
              <div className="mb-3 space-y-2">
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
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
