'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { createProposalApproveExecuteWA } from '@/lib/solana/multisig'

const PLATFORM_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS || ''

interface Props {
  taskId: string
  submissionId: string
  multisigAddress: string
  recipientWallet: string
  payoutLamports: string
  onPaid: () => void
}

export default function CampaignPayButton({ taskId, submissionId, multisigAddress, recipientWallet, payoutLamports, onPaid }: Props) {
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
      const result = await createProposalApproveExecuteWA(
        connection,
        { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
        new PublicKey(multisigAddress),
        new PublicKey(recipientWallet),
        Number(payoutLamports),
        new PublicKey(PLATFORM_WALLET),
      )

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
  const solAmount = (totalLamports / LAMPORTS_PER_SOL).toFixed(4)
  const recipientSol = (recipientAmount / LAMPORTS_PER_SOL).toFixed(4)
  const feeSol = (platformFee / LAMPORTS_PER_SOL).toFixed(4)

  return (
    <div>
      <button
        onClick={handlePay}
        disabled={loading || !PLATFORM_WALLET}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        title={`${recipientSol} SOL to creator + ${feeSol} SOL platform fee`}
      >
        {loading ? 'Paying...' : `Pay ${solAmount} SOL`}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
