'use client'

import { useState } from 'react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useAuth } from '../hooks/useAuth'
import { createMultisigVaultWA, createTransferProposalWA, getAllPermissions } from '@/lib/solana/multisig'

const ARBITER_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS || ''

interface SubmissionFormProps {
  taskId: string
  bidId: string
  creatorWallet: string
  amountLamports: string
  taskType: string
  onSubmitted?: () => void
}

export default function SubmissionForm({
  taskId,
  bidId,
  creatorWallet,
  amountLamports,
  taskType,
  onSubmitted,
}: SubmissionFormProps) {
  const { authFetch, isAuthenticated } = useAuth()
  const { connection } = useConnection()
  const wallet = useWallet()
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'uploading' | 'vault' | 'proposal' | 'submitting'>('form')
  const [error, setError] = useState('')

  const isCompetition = taskType === 'COMPETITION'

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files).slice(0, 20))
    }
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAuthenticated || !wallet.publicKey || !wallet.signTransaction) return
    setError('')
    setLoading(true)

    try {
      // Step 1: Upload files if any
      let attachments: any[] = []
      if (files.length > 0) {
        setStep('uploading')
        for (const file of files) {
          const formData = new FormData()
          formData.append('file', file)
          const uploadRes = await authFetch('/api/upload', {
            method: 'POST',
            body: formData,
            headers: {}, // Let browser set content-type for FormData
          })
          const uploadData = await uploadRes.json()
          if (!uploadData.success) throw new Error(uploadData.message || 'File upload failed')
          attachments.push({
            url: uploadData.url,
            key: uploadData.key,
            contentType: uploadData.contentType,
            size: uploadData.size,
            filename: file.name,
          })
        }
      }

      const submitBody: any = {
        description,
        attachments: attachments.length > 0 ? attachments : undefined,
      }

      // For competition mode, create vault + payment proposal on-chain
      if (isCompetition) {
        if (!ARBITER_WALLET) throw new Error('Arbiter wallet not configured')

        // Create vault
        setStep('vault')
        const members = [
          { publicKey: wallet.publicKey, permissions: getAllPermissions() },
          { publicKey: new PublicKey(creatorWallet), permissions: getAllPermissions() },
          { publicKey: new PublicKey(ARBITER_WALLET), permissions: getAllPermissions() },
        ]

        const vaultResult = await createMultisigVaultWA(
          connection,
          { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
          members,
          2
        )

        submitBody.multisigAddress = vaultResult.multisigPda.toBase58()
        submitBody.vaultAddress = vaultResult.vaultPda.toBase58()

        // Create payment proposal + self-approve
        setStep('proposal')
        const platformWallet = new PublicKey(ARBITER_WALLET)
        const { transactionIndex, signature } = await createTransferProposalWA(
          connection,
          { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction },
          vaultResult.multisigPda,
          wallet.publicKey,
          Number(amountLamports),
          `slopwork-task-${taskId}`,
          platformWallet
        )

        submitBody.proposalIndex = Number(transactionIndex)
        submitBody.txSignature = signature
      }

      // Submit to API
      setStep('submitting')
      const res = await authFetch(`/api/tasks/${taskId}/bids/${bidId}/submit`, {
        method: 'POST',
        body: JSON.stringify(submitBody),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      setDescription('')
      setFiles([])
      setStep('form')
      onSubmitted?.()
    } catch (e: any) {
      setError(e.message || 'Failed to submit deliverables')
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  const stepLabels: Record<string, string> = {
    uploading: 'Uploading files...',
    vault: 'Creating escrow vault...',
    proposal: 'Creating payment proposal...',
    submitting: 'Submitting deliverables...',
  }

  const solAmount = (Number(amountLamports) / LAMPORTS_PER_SOL).toFixed(4)

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-k-border p-5">
      <h3 className="text-lg font-semibold text-white">Submit Deliverables</h3>
      <p className="text-xs text-zinc-500">
        {isCompetition
          ? `Submit your completed work. This will create a ${solAmount} SOL escrow vault with a payment proposal for the task creator to approve.`
          : 'Upload your completed work for the task creator to review.'}
      </p>

      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what you've delivered, how to access/use it..."
          rows={4}
          required
          className="w-full rounded-lg border border-k-border bg-surface px-3 py-2 text-sm text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">
          Attachments {files.length > 0 && `(${files.length})`}
        </label>
        <input
          type="file"
          multiple
          onChange={handleFileChange}
          className="w-full text-sm text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-300 hover:file:bg-zinc-700 text-zinc-400 file:bg-zinc-800 file:text-zinc-300"
        />
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="truncate">{f.name}</span>
                <span className="text-zinc-400">({(f.size / 1024).toFixed(0)} KB)</span>
                <button type="button" onClick={() => removeFile(i)} className="text-red-500 hover:text-red-400">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !isAuthenticated}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? stepLabels[step] || 'Processing...' : isCompetition ? 'Submit Work + Create Escrow' : 'Submit Deliverables'}
      </button>
    </form>
  )
}
