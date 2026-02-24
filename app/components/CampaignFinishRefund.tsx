'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { createProposalApproveExecuteWA } from '@/lib/solana/multisig'
import { createProposalApproveExecuteSplWA, USDC_MINT } from '@/lib/solana/spl-token'
import { type PaymentTokenType, formatTokenAmount, resolveTokenInfo } from '@/lib/token-utils'

interface Props {
  taskId: string
  multisigAddress: string
  budgetRemainingLamports: string
  paymentToken?: PaymentTokenType
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
  onClose: () => void
  onFinished: () => void
}

export default function CampaignFinishRefund({
  taskId,
  multisigAddress,
  budgetRemainingLamports,
  paymentToken = 'SOL',
  customTokenMint,
  customTokenSymbol,
  customTokenDecimals,
  onClose,
  onFinished,
}: Props) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const wallet = useWallet()
  const [step, setStep] = useState<'confirm' | 'refunding' | 'finalizing'>('confirm')
  const [error, setError] = useState('')

  const tInfo = resolveTokenInfo(paymentToken, customTokenMint, customTokenSymbol, customTokenDecimals)
  const remaining = Number(budgetRemainingLamports)
  const hasRemaining = remaining > 0
  const displayAmount = formatTokenAmount(budgetRemainingLamports, tInfo, 2)

  const handleFinish = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return
    setError('')

    let refundTxSig: string | undefined

    if (hasRemaining) {
      setStep('refunding')
      try {
        const walletSigner = { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction }
        const msigPda = new PublicKey(multisigAddress)

        let result: { transactionIndex: bigint; signature: string }
        if (paymentToken === 'SOL') {
          result = await createProposalApproveExecuteWA(
            connection, walletSigner, msigPda,
            wallet.publicKey,
            remaining,
            undefined,
          )
        } else {
          const mint = paymentToken === 'CUSTOM' && customTokenMint
            ? new PublicKey(customTokenMint)
            : USDC_MINT
          result = await createProposalApproveExecuteSplWA(
            connection, walletSigner, msigPda,
            wallet.publicKey,
            remaining,
            undefined,
            undefined,
            mint,
          )
        }
        refundTxSig = result.signature
      } catch (e: any) {
        setError(e.message || 'Refund transaction failed')
        setStep('confirm')
        return
      }
    }

    setStep('finalizing')
    try {
      const res = await authFetch(`/api/tasks/${taskId}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refundTxSig: refundTxSig || null }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.message || 'Failed to finalize campaign')
        setStep('confirm')
        return
      }
      onFinished()
    } catch {
      setError('Network error while finalizing')
      setStep('confirm')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-k-border bg-zinc-900 p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-bold text-white">Finish Campaign &amp; Refund</h3>

        {step === 'confirm' && (
          <>
            <div className="space-y-3 text-sm text-zinc-300">
              {hasRemaining ? (
                <p>
                  This will withdraw the remaining <span className="font-semibold text-accent">{displayAmount} {tInfo.symbol}</span> from the escrow vault back to your wallet and mark the campaign as completed.
                </p>
              ) : (
                <p>The campaign budget is fully allocated. This will mark the campaign as completed.</p>
              )}
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                <p className="font-medium mb-1">What happens:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>No more submissions will be accepted</li>
                  <li>Approved submissions that haven&apos;t requested payment will be auto-rejected</li>
                  <li>Payment-requested submissions can still be paid out</li>
                  {hasRemaining && <li>Remaining budget is refunded to your wallet</li>}
                </ul>
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
            <div className="mt-5 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-k-border px-4 py-2 text-sm font-medium text-zinc-400 hover:border-k-border-hover hover:text-zinc-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleFinish}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
              >
                {hasRemaining ? `Finish & Refund ${displayAmount} ${tInfo.symbol}` : 'Finish Campaign'}
              </button>
            </div>
          </>
        )}

        {step === 'refunding' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-zinc-300">Withdrawing {displayAmount} {tInfo.symbol} from vault...</p>
            <p className="text-xs text-zinc-500">Please confirm the transaction in your wallet</p>
          </div>
        )}

        {step === 'finalizing' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            <p className="text-sm text-zinc-300">Finalizing campaign...</p>
          </div>
        )}
      </div>
    </div>
  )
}
