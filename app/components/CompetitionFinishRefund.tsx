'use client'

import { useState, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { getVaultPda, createProposalApproveExecuteWA } from '@/lib/solana/multisig'
import { createProposalApproveExecuteSplWA, USDC_MINT, getAta } from '@/lib/solana/spl-token'
import { getAccount } from '@solana/spl-token'
import { type PaymentTokenType, formatTokenAmount, resolveTokenInfo } from '@/lib/token-utils'

interface Props {
  taskId: string
  multisigAddress: string
  budgetLamports: string
  paymentToken?: PaymentTokenType
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
  winnersAwarded: number
  maxWinners: number
  onClose: () => void
  onFinished: () => void
}

export default function CompetitionFinishRefund({
  taskId,
  multisigAddress,
  budgetLamports,
  paymentToken = 'SOL',
  customTokenMint,
  customTokenSymbol,
  customTokenDecimals,
  winnersAwarded,
  maxWinners,
  onClose,
  onFinished,
}: Props) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const wallet = useWallet()
  const [step, setStep] = useState<'loading' | 'confirm' | 'refunding' | 'finalizing'>('loading')
  const [error, setError] = useState('')
  const [refundAmount, setRefundAmount] = useState(0)

  const tInfo = resolveTokenInfo(paymentToken, customTokenMint, customTokenSymbol, customTokenDecimals)
  const hasRefund = refundAmount > 0
  const displayAmount = formatTokenAmount(String(refundAmount), tInfo, 2)
  const remainingWinners = maxWinners - winnersAwarded

  useEffect(() => {
    const calcRefund = async () => {
      try {
        const msigPda = new PublicKey(multisigAddress)
        const vaultPda = getVaultPda(msigPda)

        if (paymentToken === 'SOL') {
          const vaultBalance = await connection.getBalance(vaultPda)
          setRefundAmount(Math.max(0, vaultBalance - 2_000_000))
        } else {
          const mint = paymentToken === 'CUSTOM' && customTokenMint
            ? new PublicKey(customTokenMint)
            : USDC_MINT
          const vaultAta = getAta(vaultPda, mint)
          const account = await getAccount(connection, vaultAta)
          setRefundAmount(Number(account.amount))
        }
      } catch {
        setRefundAmount(Number(budgetLamports))
      }
      setStep('confirm')
    }
    calcRefund()
  }, [connection, multisigAddress, paymentToken, budgetLamports, customTokenMint])

  const handleFinish = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) return
    setError('')

    let refundTxSig: string | undefined

    if (hasRefund) {
      setStep('refunding')
      try {
        const walletSigner = { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction }
        const msigPda = new PublicKey(multisigAddress)

        let result: { transactionIndex: bigint; signature: string }
        if (paymentToken === 'SOL') {
          result = await createProposalApproveExecuteWA(
            connection, walletSigner, msigPda,
            wallet.publicKey,
            refundAmount,
            undefined,
          )
        } else {
          const mint = paymentToken === 'CUSTOM' && customTokenMint
            ? new PublicKey(customTokenMint)
            : USDC_MINT
          result = await createProposalApproveExecuteSplWA(
            connection, walletSigner, msigPda,
            wallet.publicKey,
            refundAmount,
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
        setError(data.message || 'Failed to finalize competition')
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
        <h3 className="mb-4 text-lg font-bold text-white">Stop Competition &amp; Refund</h3>

        {step === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <p className="text-sm text-zinc-300">Checking vault balance...</p>
          </div>
        )}

        {step === 'confirm' && (
          <>
            <div className="space-y-3 text-sm text-zinc-300">
              {hasRefund ? (
                <p>
                  This will withdraw <span className="font-semibold text-amber-400">{displayAmount} {tInfo.symbol}</span> from the escrow vault back to your wallet and stop the competition.
                </p>
              ) : (
                <p>The vault is empty. This will stop the competition and reject remaining entries.</p>
              )}
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                <p className="font-medium mb-1">What happens:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>No more entries will be accepted</li>
                  <li>All pending (unawarded) entries will be rejected</li>
                  {winnersAwarded > 0 && (
                    <li>{winnersAwarded} winner{winnersAwarded > 1 ? 's' : ''} already awarded will keep their prizes</li>
                  )}
                  {remainingWinners > 0 && (
                    <li>{remainingWinners} unfilled winner slot{remainingWinners > 1 ? 's' : ''} will be cancelled</li>
                  )}
                  {hasRefund && <li>Remaining funds are refunded to your wallet</li>}
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
                {hasRefund ? `Stop & Refund ${displayAmount} ${tInfo.symbol}` : 'Stop Competition'}
              </button>
            </div>
          </>
        )}

        {step === 'refunding' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <p className="text-sm text-zinc-300">Withdrawing {displayAmount} {tInfo.symbol} from vault...</p>
            <p className="text-xs text-zinc-500">Please confirm the transaction in your wallet</p>
          </div>
        )}

        {step === 'finalizing' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
            <p className="text-sm text-zinc-300">Finalizing competition...</p>
          </div>
        )}
      </div>
    </div>
  )
}
