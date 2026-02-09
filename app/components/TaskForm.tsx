'use client'

import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { useRouter } from 'next/navigation'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''
const TASK_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_TASK_FEE_LAMPORTS || 10000000)

export default function TaskForm() {
  const { authFetch, isAuthenticated } = useAuth()
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('')
  const [taskType, setTaskType] = useState<'QUOTE' | 'COMPETITION'>('QUOTE')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'paying' | 'creating'>('form')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!publicKey || !isAuthenticated) return
    setError('')
    setLoading(true)

    try {
      const budgetLamports = Math.round(parseFloat(budget) * LAMPORTS_PER_SOL)
      if (isNaN(budgetLamports) || budgetLamports <= 0) throw new Error('Invalid budget')

      // Step 1: Pay the posting fee
      setStep('paying')
      if (!SYSTEM_WALLET) throw new Error('System wallet not configured')

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(SYSTEM_WALLET),
          lamports: TASK_FEE_LAMPORTS,
        })
      )

      const signature = await sendTransaction(tx, connection)
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

      // Step 2: Create task via API
      setStep('creating')
      const res = await authFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title, description, budgetLamports, taskType, paymentTxSignature: signature }),
      })
      const data = await res.json()

      if (!data.success) throw new Error(data.message)

      router.push(`/tasks/${data.task.id}`)
    } catch (e: any) {
      setError(e.message || 'Failed to create task')
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Task Type</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setTaskType('QUOTE')}
            className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
              taskType === 'QUOTE'
                ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800'
                : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600'
            }`}
          >
            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">Request for Quote</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Bidders propose, you pick a winner, then they complete the work.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTaskType('COMPETITION')}
            className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
              taskType === 'COMPETITION'
                ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800'
                : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600'
            }`}
          >
            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">Competition</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Bidders complete the work first, then you pick the best submission.
            </span>
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need done?"
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the task in detail..."
          rows={5}
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Budget (SOL)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="0.5"
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <p className="mt-1 text-xs text-zinc-500">
          A fee of {TASK_FEE_LAMPORTS / LAMPORTS_PER_SOL} SOL will be charged to post this task.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading || !isAuthenticated}
        className="w-full rounded-lg bg-zinc-900 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading
          ? step === 'paying'
            ? 'Paying posting fee...'
            : 'Creating task...'
          : 'Post Task'}
      </button>
    </form>
  )
}
