'use client'

import { useState } from 'react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'
import { approveAndExecuteWA, createProposalApproveExecuteWA } from '@/lib/solana/multisig'

const PLATFORM_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS || ''

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(2)} SOL`
}

export interface WinnerBid {
  id: string
  bidderId: string
  amountLamports: string
  multisigAddress: string | null
  vaultAddress: string | null
  proposalIndex: number | null
  status: string
  winnerPlace?: number | null
  bidderWallet: string
  bidderUsername?: string | null
  bidderProfilePic?: string | null
}

interface SelectWinnerButtonProps {
  bid: WinnerBid
  taskId: string
  taskType: string
  taskMultisigAddress?: string | null
  winnerPlace?: number
  prizeAmountLamports?: string
  onDone?: () => void
}

const PLACE_LABELS = ['1st', '2nd', '3rd']
function placeLabel(place: number): string {
  return place <= 3 ? PLACE_LABELS[place - 1] : `${place}th`
}

export default function SelectWinnerButton({
  bid,
  taskId,
  taskType,
  taskMultisigAddress,
  winnerPlace,
  prizeAmountLamports,
  onDone,
}: SelectWinnerButtonProps) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const { publicKey, sendTransaction, signTransaction } = useWallet()
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<'idle' | 'accepting' | 'funding' | 'approving' | 'paying'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [needsRetry, setNeedsRetry] = useState(false)
  const [paymentSig, setPaymentSig] = useState<string | null>(null)

  const isCompetition = taskType === 'COMPETITION'
  const paymentAmount = prizeAmountLamports || bid.amountLamports

  const payWinner = async () => {
    if (!publicKey || !signTransaction || !taskMultisigAddress || !PLATFORM_WALLET) return

    setStep('paying')
    const multisigPda = new PublicKey(taskMultisigAddress)
    const winnerWallet = new PublicKey(bid.bidderWallet)
    const lamports = Number(paymentAmount)

    const { signature } = await createProposalApproveExecuteWA(
      connection,
      { publicKey, signTransaction },
      multisigPda,
      winnerWallet,
      lamports,
      new PublicKey(PLATFORM_WALLET),
      `slopwork-payout-${taskId}-place${winnerPlace || 1}`,
    )

    const payRes = await authFetch(`/api/tasks/${taskId}/bids/${bid.id}/approve-payment`, {
      method: 'POST',
      body: JSON.stringify({ paymentTxSignature: signature }),
    })
    const payData = await payRes.json()
    if (!payData.success) throw new Error(payData.message)

    setError(null)
    setNeedsRetry(false)
    setPaymentSig(signature)
    onDone?.()
  }

  const handleSelect = async () => {
    if (!publicKey || !signTransaction) return
    setBusy(true)
    setError(null)

    try {
      if (isCompetition) {
        setStep('accepting')
        const acceptRes = await authFetch(`/api/tasks/${taskId}/bids/${bid.id}/accept`, {
          method: 'POST',
          body: JSON.stringify({ winnerPlace: winnerPlace || 1 }),
        })
        const acceptData = await acceptRes.json()
        if (!acceptData.success) throw new Error(acceptData.message)

        await payWinner()
      } else {
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

        onDone?.()
      }
    } catch (e: any) {
      console.error('Select winner failed:', e)
      if (isCompetition && step === 'paying') {
        setError(e.message || 'Payment failed')
        setNeedsRetry(true)
      } else {
        setError(e.message || 'Operation failed')
      }
      onDone?.()
    } finally {
      setBusy(false)
      setStep('idle')
    }
  }

  const handleRetry = async () => {
    if (!publicKey || !signTransaction) return
    setBusy(true)
    setError(null)
    try {
      await payWinner()
    } catch (e: any) {
      console.error('Retry payment failed:', e)
      setError(e.message || 'Payment failed')
      setNeedsRetry(true)
      onDone?.()
    } finally {
      setBusy(false)
      setStep('idle')
    }
  }

  const getButtonText = () => {
    if (step === 'accepting') return 'Accepting...'
    if (step === 'funding') return 'Funding vault...'
    if (step === 'approving') return 'Approving payment...'
    if (step === 'paying') return 'Processing payment...'
    return 'Processing...'
  }

  const label = winnerPlace
    ? `Award ${placeLabel(winnerPlace)} Place & Pay (${formatSol(paymentAmount)})`
    : `Select Winner & Pay (${formatSol(paymentAmount)})`

  if (paymentSig) {
    return (
      <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-400">
        {winnerPlace ? `${placeLabel(winnerPlace)} place payment successful!` : 'Payment successful!'}{' '}
        <a
          href={`https://orb.helius.dev/tx/${paymentSig}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs underline hover:text-green-200"
        >
          {paymentSig.slice(0, 8)}...{paymentSig.slice(-8)}
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
      </div>
    )
  }

  if (needsRetry && error) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          Payment failed: {error}
        </div>
        <button
          onClick={handleRetry}
          disabled={busy}
          className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? getButtonText() : `Retry Payment (${formatSol(paymentAmount)})`}
        </button>
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div className="mb-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <button
        onClick={handleSelect}
        disabled={busy}
        className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? getButtonText() : label}
      </button>
    </div>
  )
}
