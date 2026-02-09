'use client'

import { useState } from 'react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'
import { createMultisigVaultWA, getAllPermissions } from '@/lib/solana/multisig'

const ARBITER_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS || ''

interface BidFormProps {
  taskId: string
  creatorWallet: string
  taskType?: string
  onBidPlaced?: () => void
}

export default function BidForm({ taskId, creatorWallet, taskType = 'QUOTE', onBidPlaced }: BidFormProps) {
  const { authFetch, isAuthenticated } = useAuth()
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'vault' | 'submitting'>('form')
  const [error, setError] = useState('')

  const isCompetition = taskType === 'COMPETITION'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated || !publicKey || !signTransaction) return
    setError('')
    setLoading(true)

    try {
      const amountLamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL)
      if (isNaN(amountLamports) || amountLamports <= 0) throw new Error('Invalid amount')

      if (!ARBITER_WALLET) throw new Error('Arbiter wallet not configured')

      let multisigAddress: string | undefined
      let vaultAddress: string | undefined

      // Only create vault at bid time for QUOTE tasks
      if (!isCompetition) {
        setStep('vault')
        const members = [
          { publicKey: publicKey, permissions: getAllPermissions() },
          { publicKey: new PublicKey(creatorWallet), permissions: getAllPermissions() },
          { publicKey: new PublicKey(ARBITER_WALLET), permissions: getAllPermissions() },
        ]

        const vaultResult = await createMultisigVaultWA(
          connection,
          { publicKey, signTransaction },
          members,
          2 // threshold: 2 of 3
        )
        multisigAddress = vaultResult.multisigPda.toBase58()
        vaultAddress = vaultResult.vaultPda.toBase58()
      }

      // Submit bid to API
      setStep('submitting')
      const bidBody: any = { amountLamports, description }
      if (multisigAddress) bidBody.multisigAddress = multisigAddress
      if (vaultAddress) bidBody.vaultAddress = vaultAddress

      const res = await authFetch(`/api/tasks/${taskId}/bids`, {
        method: 'POST',
        body: JSON.stringify(bidBody),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      setAmount('')
      setDescription('')
      setStep('form')
      onBidPlaced?.()
    } catch (e: any) {
      setError(e.message || 'Failed to place bid')
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  const buttonText = loading
    ? step === 'vault'
      ? 'Creating escrow vault...'
      : 'Submitting bid...'
    : 'Submit Bid'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Place a Bid</h3>
      <p className="text-xs text-zinc-500">
        {isCompetition
          ? 'Submit your bid. Complete the work and submit deliverables with escrow vault to be eligible for selection.'
          : 'Submitting creates a 2/3 multisig escrow vault (you, task creator, platform arbiter).'}
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Your Price (SOL)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.3"
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Proposal</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your approach and qualifications..."
          rows={3}
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !isAuthenticated}
        className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {buttonText}
      </button>
    </form>
  )
}
