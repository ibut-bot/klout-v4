'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { createProposalApproveExecuteWA } from '@/lib/solana/multisig'
import { createProposalApproveExecuteUsdcWA } from '@/lib/solana/spl-token'
import { type PaymentTokenType, formatTokenAmount, tokenSymbol, tokenMultiplier } from '@/lib/token-utils'

const PLATFORM_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS || ''

interface Props {
  taskId: string
  submissionId: string
  multisigAddress: string
  recipientWallet: string
  payoutLamports: string
  onPaid: () => void
  paymentToken?: PaymentTokenType
}

export default function CampaignPayButton({ taskId, submissionId, multisigAddress, recipientWallet, payoutLamports, onPaid, paymentToken = 'SOL' }: Props) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const wallet = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePay = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !PLATFORM_WALLET) return
    setError('')
    setLoading(true)

    try {
      // 1. Create proposal + approve + execute in one tx (90% to recipient, 10% platform fee)
      const walletSigner = { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction }
      const msigPda = new PublicKey(multisigAddress)
      const recipientPk = new PublicKey(recipientWallet)
      const platformPk = new PublicKey(PLATFORM_WALLET)
      const amount = Number(payoutLamports)

      const result = paymentToken === 'USDC'
        ? await createProposalApproveExecuteUsdcWA(connection, walletSigner, msigPda, recipientPk, amount, platformPk)
        : await createProposalApproveExecuteWA(connection, walletSigner, msigPda, recipientPk, amount, platformPk)

      // 2. Notify the backend
      const res = await authFetch(`/api/tasks/${taskId}/campaign-submissions/${submissionId}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          paymentTxSig: result.signature,
          proposalIndex: result.transactionIndex.toString(),
        }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      onPaid()
    } catch (e: any) {
      setError(e.message || 'Payment failed')
    } finally {
      setLoading(false)
    }
  }

  const totalLamports = Number(payoutLamports)
  const platformFee = Math.floor(totalLamports * 0.1)
  const recipientAmount = totalLamports - platformFee
  const sym = tokenSymbol(paymentToken)
  const totalDisplay = formatTokenAmount(totalLamports, paymentToken)
  const recipientDisplay = formatTokenAmount(recipientAmount, paymentToken)
  const feeDisplay = formatTokenAmount(platformFee, paymentToken)

  return (
    <div>
      <button
        onClick={handlePay}
        disabled={loading || !PLATFORM_WALLET}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        title={`${recipientDisplay} ${sym} to creator + ${feeDisplay} ${sym} platform fee`}
      >
        {loading ? 'Paying...' : `Pay ${totalDisplay} ${sym}`}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
