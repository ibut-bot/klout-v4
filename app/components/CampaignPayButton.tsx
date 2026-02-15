'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { createProposalApproveExecuteWA } from '@/lib/solana/multisig'
import { createProposalApproveExecuteSplWA, USDC_MINT } from '@/lib/solana/spl-token'
import { type PaymentTokenType, type TokenInfo, formatTokenAmount, resolveTokenInfo } from '@/lib/token-utils'

const PLATFORM_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS || ''

interface Props {
  taskId: string
  submissionId: string
  multisigAddress: string
  recipientWallet: string
  payoutLamports: string
  onPaid: () => void
  paymentToken?: PaymentTokenType
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
}

export default function CampaignPayButton({ taskId, submissionId, multisigAddress, recipientWallet, payoutLamports, onPaid, paymentToken = 'SOL', customTokenMint, customTokenSymbol, customTokenDecimals }: Props) {
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

      let result: { transactionIndex: bigint; signature: string }
      if (paymentToken === 'SOL') {
        result = await createProposalApproveExecuteWA(connection, walletSigner, msigPda, recipientPk, amount, platformPk)
      } else {
        // USDC or CUSTOM — use SPL transfer with the correct mint
        const mint = paymentToken === 'CUSTOM' && customTokenMint
          ? new PublicKey(customTokenMint)
          : USDC_MINT
        result = await createProposalApproveExecuteSplWA(connection, walletSigner, msigPda, recipientPk, amount, platformPk, undefined, mint)
      }

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

  const tInfo = resolveTokenInfo(paymentToken, customTokenMint, customTokenSymbol, customTokenDecimals)
  const totalLamports = Number(payoutLamports)
  const platformFee = Math.floor(totalLamports * 0.1)
  const recipientAmount = totalLamports - platformFee
  const sym = tInfo.symbol
  const totalDisplay = formatTokenAmount(totalLamports, tInfo)
  const recipientDisplay = formatTokenAmount(recipientAmount, tInfo)
  const feeDisplay = formatTokenAmount(platformFee, tInfo)

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
