'use client'

import { useState, useRef, useCallback } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { useRouter } from 'next/navigation'
import { createMultisigVaultAndFundWA } from '@/lib/solana/multisig'
import { createMultisigVaultAndFundUsdcWA } from '@/lib/solana/spl-token'
import { type PaymentTokenType, tokenMultiplier } from '@/lib/token-utils'
import ImagePositionEditor, { type ImageTransform } from './ImagePositionEditor'

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

  // Payment token selector (campaign only)
  const [paymentToken, setPaymentToken] = useState<PaymentTokenType>('SOL')

  // Campaign-specific fields
  const [cpm, setCpm] = useState('')
  const [heading, setHeading] = useState('')
  const [minViews, setMinViews] = useState('100')
  const [minLikes, setMinLikes] = useState('0')
  const [minRetweets, setMinRetweets] = useState('0')
  const [minComments, setMinComments] = useState('0')
  const [minPayout, setMinPayout] = useState('')
  const [dos, setDos] = useState<string[]>([''])
  const [donts, setDonts] = useState<string[]>([''])
  const [collateralLink, setCollateralLink] = useState('')

  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageTransform, setImageTransform] = useState<ImageTransform>({ scale: 1, x: 50, y: 50 })
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
    setImageTransform({ scale: 1, x: 50, y: 50 })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleTransformChange = useCallback((t: ImageTransform) => {
    setImageTransform(t)
  }, [])

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
      const multiplier = (taskType === 'CAMPAIGN') ? tokenMultiplier(paymentToken) : LAMPORTS_PER_SOL
      const budgetLamports = Math.round(parseFloat(budget) * multiplier)
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
        const walletSigner = { publicKey, signTransaction }
        let result: { multisigPda: { toBase58(): string }; vaultPda: { toBase58(): string }; signature: string }
        if (taskType === 'CAMPAIGN' && paymentToken === 'USDC') {
          result = await createMultisigVaultAndFundUsdcWA(connection, walletSigner, budgetLamports)
        } else {
          result = await createMultisigVaultAndFundWA(connection, walletSigner, budgetLamports)
        }
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
        paymentToken,
        cpmLamports: Math.round(parseFloat(cpm) * multiplier),
        ...(heading.trim() ? { heading: heading.trim() } : {}),
        minViews: parseInt(minViews) || 100,
        minLikes: parseInt(minLikes) || 0,
        minRetweets: parseInt(minRetweets) || 0,
        minComments: parseInt(minComments) || 0,
        ...(minPayout ? { minPayoutLamports: Math.round(parseFloat(minPayout) * multiplier) } : {}),
        ...(collateralLink.trim() ? { collateralLink: collateralLink.trim() } : {}),
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
          ...(imageUrl && (imageTransform.scale !== 1 || imageTransform.x !== 0 || imageTransform.y !== 0) ? { imageTransform } : {}),
        }),
      })
      const data = await res.json()

      if (!data.success) throw new Error(data.message)

      router.push(`/tasks/${data.task.id}`)
    } catch (e: any) {
      setError(e.message || 'Failed to create campaign')
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
        <label className="mb-1.5 block text-sm font-medium text-zinc-200">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need done?"
          required
          className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      {taskType === 'CAMPAIGN' && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-200">Card Heading</label>
          <input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="Short punchy headline for the campaign card"
            maxLength={120}
            className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <p className="mt-1 text-xs text-zinc-500">Optional. Shown on the campaign card instead of the description. Max 120 characters.</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-200">Campaign Details</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the campaign in detail..."
          rows={5}
          required
          className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      {taskType === 'CAMPAIGN' && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-200">Campaign Image</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          {imagePreview ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-zinc-400">Position and zoom your image for the campaign card</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={removeImage}
                    className="rounded-lg bg-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/30"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <ImagePositionEditor
                imageUrl={imagePreview}
                initialTransform={imageTransform}
                onTransformChange={handleTransformChange}
                height="h-[280px]"
                showControls={true}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed border-k-border text-zinc-500 hover:border-accent/40 hover:text-accent transition"
            >
              <div className="text-center">
                <svg className="mx-auto h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="mt-1 block text-xs">Upload campaign image</span>
              </div>
            </button>
          )}
          <p className="mt-1 text-xs text-zinc-500">Optional. This image will be shown on the campaign card. You can position and zoom it.</p>
        </div>
      )}

      {taskType === 'CAMPAIGN' && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-200">Bounty Token</label>
          <div className="flex gap-2">
            {(['SOL', 'USDC'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPaymentToken(t)}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                  paymentToken === t
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-k-border bg-surface text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">All bounty payouts, CPM, and platform fees will be denominated in the selected token.</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-200">Budget ({taskType === 'CAMPAIGN' ? paymentToken : 'SOL'})</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="0.5"
          required
          className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <p className="mt-1 text-xs text-zinc-500">
          {taskType === 'COMPETITION' || taskType === 'CAMPAIGN'
            ? `This ${paymentToken} budget will be locked in an escrow vault when you post the campaign.`
            : `A fee of ${TASK_FEE_LAMPORTS / LAMPORTS_PER_SOL} SOL will be charged to post this campaign.`}
        </p>
      </div>

      {taskType === 'CAMPAIGN' && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">CPM — Cost per 1,000 views ({paymentToken})</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={cpm}
              onChange={(e) => setCpm(e.target.value)}
              placeholder="0.01"
              required
              className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <p className="mt-1 text-xs text-zinc-500">How much you pay per 1,000 views on a promoted post.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Minimum Engagement Thresholds</label>
            <p className="mb-3 text-xs text-zinc-500">Posts must meet all these minimums to qualify. Set to 0 to skip a check.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Views</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={minViews}
                  onChange={(e) => setMinViews(e.target.value)}
                  placeholder="100"
                  className="w-full rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Likes</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={minLikes}
                  onChange={(e) => setMinLikes(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Retweets</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={minRetweets}
                  onChange={(e) => setMinRetweets(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Comments</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={minComments}
                  onChange={(e) => setMinComments(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Minimum Payout Threshold ({paymentToken}) — optional</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={minPayout}
              onChange={(e) => setMinPayout(e.target.value)}
              placeholder="0 (no minimum)"
              className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <p className="mt-1 text-xs text-zinc-500">Participants must accumulate at least this much in approved payouts before they can request payment. Leave empty or 0 for no minimum.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Guidelines — Do&apos;s</label>
            {dos.map((d, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  type="text"
                  value={d}
                  onChange={(e) => { const n = [...dos]; n[i] = e.target.value; setDos(n) }}
                  placeholder={`Guideline ${i + 1}`}
                  className="flex-1 rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
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
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Guidelines — Don&apos;ts</label>
            {donts.map((d, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  type="text"
                  value={d}
                  onChange={(e) => { const n = [...donts]; n[i] = e.target.value; setDonts(n) }}
                  placeholder={`Don't ${i + 1}`}
                  className="flex-1 rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
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

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Collateral Link — optional</label>
            <input
              type="url"
              value={collateralLink}
              onChange={(e) => setCollateralLink(e.target.value)}
              placeholder="https://drive.google.com/... or https://dropbox.com/..."
              className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <p className="mt-1 text-xs text-zinc-500">Share a link to Google Drive, Dropbox, etc. with images, logos, or other collateral that creators can use in their posts. This is for guidance only and is not checked by AI verification.</p>
          </div>
        </>
      )}

      {(taskType === 'COMPETITION' || taskType === 'CAMPAIGN') && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-200">Duration (days) — optional</label>
          <input
            type="number"
            step="1"
            min="1"
            max="365"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            placeholder="e.g. 7"
            className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <p className="mt-1 text-xs text-zinc-500">
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
            : 'Creating campaign...'
          : 'Launch Campaign'}
      </button>
    </form>
  )
}
