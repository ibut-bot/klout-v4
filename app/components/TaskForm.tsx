'use client'

import { useState, useRef } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { useRouter } from 'next/navigation'
import { createMultisigVaultAndFundWA } from '@/lib/solana/multisig'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''
const TASK_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_TASK_FEE_LAMPORTS || 10000000)

export default function TaskForm() {
  const { authFetch, isAuthenticated } = useAuth()
  const { connection } = useConnection()
  const wallet = useWallet()
  const { publicKey, sendTransaction, signTransaction } = wallet
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('')
  const [taskType, setTaskType] = useState<'QUOTE' | 'COMPETITION' | 'CAMPAIGN'>('CAMPAIGN')
  const [durationDays, setDurationDays] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'paying' | 'creating'>('form')

  // Campaign-specific fields
  const [cpm, setCpm] = useState('')
  const [minViews, setMinViews] = useState('100')
  const [minPayout, setMinPayout] = useState('')
  const [dos, setDos] = useState<string[]>([''])
  const [donts, setDonts] = useState<string[]>([''])

  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Image must be less than 10MB')
        return
      }
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', imageFile)
      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Upload failed')
      return data.url
    } catch (err: any) {
      console.error('Image upload failed:', err)
      return null
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!publicKey || !isAuthenticated) return
    setError('')
    setLoading(true)

    try {
      const budgetLamports = Math.round(parseFloat(budget) * LAMPORTS_PER_SOL)
      if (isNaN(budgetLamports) || budgetLamports <= 0) throw new Error('Invalid budget')

      // Upload image first if provided
      let imageUrl: string | null = null
      if (imageFile) {
        imageUrl = await uploadImage()
      }

      let signature: string
      let vaultDetails: { multisigAddress?: string; vaultAddress?: string } = {}

      if (taskType === 'COMPETITION' || taskType === 'CAMPAIGN') {
        // Competition/Campaign: create 1/1 multisig vault and fund it with budget
        if (!signTransaction) throw new Error('Wallet does not support signing')
        setStep('paying')
        const result = await createMultisigVaultAndFundWA(
          connection,
          { publicKey, signTransaction },
          budgetLamports,
        )
        signature = result.signature
        vaultDetails = {
          multisigAddress: result.multisigPda.toBase58(),
          vaultAddress: result.vaultPda.toBase58(),
        }
      } else {
        // Quote: pay the posting fee
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
        signature = await sendTransaction(tx, connection)
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
      }

      // Create task via API
      setStep('creating')
      const campaignFields = taskType === 'CAMPAIGN' ? {
        cpmLamports: Math.round(parseFloat(cpm) * LAMPORTS_PER_SOL),
        minViews: parseInt(minViews) || 100,
        ...(minPayout ? { minPayoutLamports: Math.round(parseFloat(minPayout) * LAMPORTS_PER_SOL) } : {}),
        guidelines: {
          dos: dos.map(d => d.trim()).filter(Boolean),
          donts: donts.map(d => d.trim()).filter(Boolean),
        },
      } : {}

      const res = await authFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title, description, budgetLamports, taskType,
          paymentTxSignature: signature,
          ...vaultDetails,
          ...campaignFields,
          ...((taskType === 'COMPETITION' || taskType === 'CAMPAIGN') && durationDays ? { durationDays: parseInt(durationDays) } : {}),
          ...(imageUrl ? { imageUrl } : {}),
        }),
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
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{error}</div>
      )}


      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need done?"
          required
          className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the task in detail..."
          rows={5}
          required
          className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      {taskType === 'CAMPAIGN' && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Campaign Image</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          {imagePreview ? (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="Campaign preview"
                className="h-32 w-32 rounded-lg object-cover border border-k-border"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-32 w-32 items-center justify-center rounded-lg border-2 border-dashed border-k-border text-zinc-600 hover:border-accent/40 hover:text-accent transition"
            >
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          <p className="mt-1 text-xs text-zinc-600">Optional. This image will be shown on the campaign card.</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-300">Budget (SOL)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="0.5"
          required
          className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <p className="mt-1 text-xs text-zinc-600">
          {taskType === 'COMPETITION' || taskType === 'CAMPAIGN'
            ? 'This budget will be locked in an escrow vault when you post the task.'
            : `A fee of ${TASK_FEE_LAMPORTS / LAMPORTS_PER_SOL} SOL will be charged to post this task.`}
        </p>
      </div>

      {taskType === 'CAMPAIGN' && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">CPM — Cost per 1,000 views (SOL)</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={cpm}
              onChange={(e) => setCpm(e.target.value)}
              placeholder="0.01"
              required
              className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <p className="mt-1 text-xs text-zinc-600">How much you pay per 1,000 views on a promoted post.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Minimum Views Threshold</label>
            <input
              type="number"
              step="1"
              min="0"
              value={minViews}
              onChange={(e) => setMinViews(e.target.value)}
              placeholder="100"
              className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <p className="mt-1 text-xs text-zinc-600">Posts must have at least this many views to qualify for payout. Set to 0 to accept all posts.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Minimum Payout Threshold (SOL) — optional</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={minPayout}
              onChange={(e) => setMinPayout(e.target.value)}
              placeholder="0 (no minimum)"
              className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <p className="mt-1 text-xs text-zinc-600">Participants must accumulate at least this much in approved payouts before they can request payment. Leave empty or 0 for no minimum.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Guidelines — Do&apos;s</label>
            {dos.map((d, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  type="text"
                  value={d}
                  onChange={(e) => { const n = [...dos]; n[i] = e.target.value; setDos(n) }}
                  placeholder={`Guideline ${i + 1}`}
                  className="flex-1 rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
                />
                {dos.length > 1 && (
                  <button type="button" onClick={() => setDos(dos.filter((_, j) => j !== i))}
                    className="px-2 text-red-400 hover:text-red-300 text-sm">Remove</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setDos([...dos, ''])}
              className="text-xs text-accent hover:text-accent-hover">+ Add guideline</button>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Guidelines — Don&apos;ts</label>
            {donts.map((d, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  type="text"
                  value={d}
                  onChange={(e) => { const n = [...donts]; n[i] = e.target.value; setDonts(n) }}
                  placeholder={`Don't ${i + 1}`}
                  className="flex-1 rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
                />
                {donts.length > 1 && (
                  <button type="button" onClick={() => setDonts(donts.filter((_, j) => j !== i))}
                    className="px-2 text-red-400 hover:text-red-300 text-sm">Remove</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setDonts([...donts, ''])}
              className="text-xs text-accent hover:text-accent-hover">+ Add guideline</button>
          </div>
        </>
      )}

      {(taskType === 'COMPETITION' || taskType === 'CAMPAIGN') && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Duration (days) — optional</label>
          <input
            type="number"
            step="1"
            min="1"
            max="365"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            placeholder="e.g. 7"
            className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <p className="mt-1 text-xs text-zinc-600">
            How many days the {taskType === 'CAMPAIGN' ? 'campaign' : 'competition'} runs. After this, no new submissions are accepted. Leave empty for no deadline.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !isAuthenticated}
        className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-black transition hover:bg-accent-hover disabled:opacity-50"
      >
        {loading
          ? step === 'paying'
            ? (taskType === 'COMPETITION' || taskType === 'CAMPAIGN') ? 'Creating escrow vault...' : 'Paying posting fee...'
            : taskType === 'CAMPAIGN' ? 'Creating campaign...' : 'Creating task...'
          : taskType === 'CAMPAIGN' ? 'Launch Campaign' : 'Post Task'}
      </button>
    </form>
  )
}
