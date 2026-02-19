'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import Link from 'next/link'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import ImagePositionEditor, { getImageTransformStyle, type ImageTransform } from '../components/ImagePositionEditor'
import { type PaymentTokenType, type TokenInfo, formatTokenAmount, resolveTokenInfo } from '@/lib/token-utils'
import { getAta, USDC_MINT } from '@/lib/solana/spl-token'
import { createTransferInstruction } from '@solana/spl-token'

interface Task {
  id: string
  title: string
  description: string
  budgetLamports: string
  taskType?: string
  paymentToken?: PaymentTokenType
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
  customTokenLogoUri?: string | null
  status: string
  creatorWallet: string
  creatorUsername?: string | null
  creatorProfilePic?: string | null
  bidCount: number
  submissionCount?: number
  budgetRemainingLamports?: string | null
  imageUrl?: string | null
  imageTransform?: ImageTransform | null
  deadlineAt?: string | null
  createdAt: string
  vaultAddress?: string | null
  campaignConfig?: {
    cpmLamports: string
    budgetRemainingLamports: string
    guidelines: { dos: string[]; donts: string[] }
    heading?: string | null
    minViews: number
    minLikes: number
    minRetweets: number
    minComments: number
    minPayoutLamports: string
    maxBudgetPerUserPercent?: number
    maxBudgetPerPostPercent?: number
    minKloutScore?: number | null
    requireFollowX?: string | null
    collateralLink?: string | null
  } | null
  winningBid?: {
    id: string
    amountLamports: string
    status: string
    bidderWallet: string
  } | null
}

interface Bid {
  id: string
  amountLamports: string
  description: string
  status: string
  createdAt: string
  isWinningBid: boolean
  task: {
    id: string
    title: string
    budgetLamports: string
    status: string
    creatorWallet: string
    url: string
  }
}

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(4)} SOL`
}

const BID_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-zinc-700/50 text-zinc-400',
  ACCEPTED: 'bg-blue-500/20 text-blue-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  FUNDED: 'bg-green-500/20 text-green-400',
  PAYMENT_REQUESTED: 'bg-amber-500/20 text-amber-400',
  COMPLETED: 'bg-zinc-700/50 text-zinc-400',
  DISPUTED: 'bg-red-500/20 text-red-400',
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-500/20 text-green-400',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-400',
  COMPLETED: 'bg-zinc-700/50 text-zinc-400',
  DISPUTED: 'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-zinc-700/50 text-zinc-500',
}

function getCountdown(deadlineAt: string): { label: string; isEnded: boolean } {
  const diff = new Date(deadlineAt).getTime() - Date.now()
  if (diff <= 0) return { label: 'Ended', isEnded: true }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return { label: `${days}d ${hours}h left`, isEnded: false }
  if (hours > 0) return { label: `${hours}h ${minutes}m left`, isEnded: false }
  return { label: `${minutes}m left`, isEnded: false }
}

interface CampaignCardProps {
  task: Task
  onTaskUpdate: (taskId: string, updates: Partial<Task>) => void
  authFetch: (url: string, options?: RequestInit) => Promise<Response>
}

function CampaignCard({ task, onTaskUpdate, authFetch }: CampaignCardProps) {
  const pt: PaymentTokenType = task.paymentToken || 'SOL'
  const tInfo = resolveTokenInfo(pt, task.customTokenMint, task.customTokenSymbol, task.customTokenDecimals)
  const sym = tInfo.symbol
  const mult = tInfo.multiplier
  const { connection } = useConnection()
  const wallet = useWallet()
  const { publicKey, sendTransaction } = wallet

  const [editMode, setEditMode] = useState<'none' | 'image' | 'details'>('none')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [countdown, setCountdown] = useState<{ label: string; isEnded: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit form state
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDescription, setEditDescription] = useState(task.description)
  const [editHeading, setEditHeading] = useState(task.campaignConfig?.heading || '')
  const [editDos, setEditDos] = useState<string[]>((task.campaignConfig?.guidelines?.dos || []).length > 0 ? task.campaignConfig!.guidelines.dos : [''])
  const [editDonts, setEditDonts] = useState<string[]>((task.campaignConfig?.guidelines?.donts || []).length > 0 ? task.campaignConfig!.guidelines.donts : [''])
  const [editMinViews, setEditMinViews] = useState(String(task.campaignConfig?.minViews ?? 100))
  const [editMinLikes, setEditMinLikes] = useState(String(task.campaignConfig?.minLikes ?? 0))
  const [editMinRetweets, setEditMinRetweets] = useState(String(task.campaignConfig?.minRetweets ?? 0))
  const [editMinComments, setEditMinComments] = useState(String(task.campaignConfig?.minComments ?? 0))
  const [editCpm, setEditCpm] = useState(task.campaignConfig ? String(Number(task.campaignConfig.cpmLamports) / mult) : '')
  const [editMinPayout, setEditMinPayout] = useState(task.campaignConfig && Number(task.campaignConfig.minPayoutLamports) > 0 ? String(Number(task.campaignConfig.minPayoutLamports) / mult) : '')
  const [editCollateralLink, setEditCollateralLink] = useState(task.campaignConfig?.collateralLink || '')
  const [editMaxBudgetPerUser, setEditMaxBudgetPerUser] = useState(task.campaignConfig?.maxBudgetPerUserPercent != null ? String(task.campaignConfig.maxBudgetPerUserPercent) : '')
  const [editMaxBudgetPerPost, setEditMaxBudgetPerPost] = useState(task.campaignConfig?.maxBudgetPerPostPercent != null ? String(task.campaignConfig.maxBudgetPerPostPercent) : '')
  const [editMinKloutScore, setEditMinKloutScore] = useState(task.campaignConfig?.minKloutScore != null ? String(task.campaignConfig.minKloutScore) : '')
  const [editRequireFollowX, setEditRequireFollowX] = useState(task.campaignConfig?.requireFollowX || '')
  const [editDeadline, setEditDeadline] = useState(task.deadlineAt ? new Date(task.deadlineAt).toISOString().slice(0, 16) : '')
  const [editBudget, setEditBudget] = useState('')
  const [editError, setEditError] = useState('')
  const [imageTransform, setImageTransform] = useState<ImageTransform>(task.imageTransform as ImageTransform || { scale: 1, x: 50, y: 50 })
  const [editingImagePosition, setEditingImagePosition] = useState(false)

  const budgetTotal = Number(task.budgetLamports)
  const budgetRemaining = task.budgetRemainingLamports ? Number(task.budgetRemainingLamports) : budgetTotal
  const budgetUsedPercent = budgetTotal > 0 ? Math.round(((budgetTotal - budgetRemaining) / budgetTotal) * 100) : 0
  const currentBudgetHuman = budgetTotal / mult

  useEffect(() => {
    if (!task.deadlineAt) return
    const update = () => setCountdown(getCountdown(task.deadlineAt!))
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [task.deadlineAt])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return }
    if (file.size > 10 * 1024 * 1024) { alert('Image must be less than 10MB'); return }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await authFetch('/api/upload', { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()
      if (!uploadData.success) throw new Error(uploadData.message || 'Upload failed')

      const updateRes = await authFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageUrl: uploadData.url }),
      })
      const updateData = await updateRes.json()
      if (!updateData.success) throw new Error(updateData.message || 'Update failed')

      onTaskUpdate(task.id, { imageUrl: uploadData.url, imageTransform: null })
      setImageTransform({ scale: 1, x: 50, y: 50 })
      setEditMode('none')
    } catch (err: any) {
      alert(err.message || 'Failed to update image')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveImage = async () => {
    if (!confirm('Remove campaign image?')) return
    setUploading(true)
    try {
      const res = await authFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageUrl: null, imageTransform: null }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Update failed')
      onTaskUpdate(task.id, { imageUrl: null, imageTransform: null })
      setEditMode('none')
    } catch (err: any) {
      alert(err.message || 'Failed to remove image')
    } finally {
      setUploading(false)
    }
  }

  const handleSaveImagePosition = async () => {
    setSaving(true)
    try {
      const res = await authFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageTransform }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Update failed')
      onTaskUpdate(task.id, { imageTransform })
      setEditingImagePosition(false)
    } catch (err: any) {
      alert(err.message || 'Failed to save image position')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDetails = async () => {
    setSaving(true)
    setEditError('')
    try {
      const updates: any = {}

      if (editTitle.trim() !== task.title) {
        updates.title = editTitle.trim()
      }

      if (editDescription !== task.description) {
        updates.description = editDescription
      }

      // Guidelines
      const newDos = editDos.map(d => d.trim()).filter(Boolean)
      const newDonts = editDonts.map(d => d.trim()).filter(Boolean)
      const currentDos = task.campaignConfig?.guidelines?.dos || []
      const currentDonts = task.campaignConfig?.guidelines?.donts || []
      if (JSON.stringify(newDos) !== JSON.stringify(currentDos) || JSON.stringify(newDonts) !== JSON.stringify(currentDonts)) {
        updates.guidelines = { dos: newDos, donts: newDonts }
      }

      // Heading
      const currentHeading = task.campaignConfig?.heading || ''
      if (editHeading.trim() !== currentHeading) {
        updates.heading = editHeading.trim() || null
      }

      // Collateral link
      const currentCollateralLink = task.campaignConfig?.collateralLink || ''
      if (editCollateralLink.trim() !== currentCollateralLink) {
        updates.collateralLink = editCollateralLink.trim() || null
      }

      // Engagement thresholds
      const newMinViews = parseInt(editMinViews) || 0
      const newMinLikes = parseInt(editMinLikes) || 0
      const newMinRetweets = parseInt(editMinRetweets) || 0
      const newMinComments = parseInt(editMinComments) || 0
      if (newMinViews !== (task.campaignConfig?.minViews ?? 100)) updates.minViews = newMinViews
      if (newMinLikes !== (task.campaignConfig?.minLikes ?? 0)) updates.minLikes = newMinLikes
      if (newMinRetweets !== (task.campaignConfig?.minRetweets ?? 0)) updates.minRetweets = newMinRetweets
      if (newMinComments !== (task.campaignConfig?.minComments ?? 0)) updates.minComments = newMinComments

      // Budget caps (empty string = clear / null)
      const newMaxPerUser = editMaxBudgetPerUser ? parseFloat(editMaxBudgetPerUser) : null
      const newMaxPerPost = editMaxBudgetPerPost ? parseFloat(editMaxBudgetPerPost) : null
      const curMaxPerUser = task.campaignConfig?.maxBudgetPerUserPercent ?? null
      const curMaxPerPost = task.campaignConfig?.maxBudgetPerPostPercent ?? null
      if (newMaxPerUser !== curMaxPerUser) updates.maxBudgetPerUserPercent = newMaxPerUser
      if (newMaxPerPost !== curMaxPerPost) updates.maxBudgetPerPostPercent = newMaxPerPost

      // Min Klout score
      const newMinKlout = editMinKloutScore ? parseInt(editMinKloutScore) : null
      const curMinKlout = task.campaignConfig?.minKloutScore ?? null
      if (newMinKlout !== curMinKlout) updates.minKloutScore = newMinKlout

      // Require Follow X
      const newFollowX = editRequireFollowX.trim().replace(/^@/, '') || null
      const curFollowX = task.campaignConfig?.requireFollowX ?? null
      if (newFollowX !== curFollowX) updates.requireFollowX = newFollowX

      // Deadline
      if (editDeadline) {
        const newDeadline = new Date(editDeadline).toISOString()
        if (newDeadline !== task.deadlineAt) {
          updates.deadlineAt = newDeadline
        }
      } else if (task.deadlineAt && !editDeadline) {
        updates.deadlineAt = null
      }

      // Budget increase
      if (editBudget) {
        const newBudgetSol = parseFloat(editBudget)
        if (isNaN(newBudgetSol) || newBudgetSol <= 0) {
          setEditError('Invalid budget amount')
          setSaving(false)
          return
        }
        const newBudgetBaseUnits = Math.round(newBudgetSol * mult)
        if (newBudgetBaseUnits <= budgetTotal) {
          setEditError('New budget must be greater than current budget')
          setSaving(false)
          return
        }

        // Send the difference to the vault
        const difference = newBudgetBaseUnits - budgetTotal
        if (!publicKey || !task.vaultAddress) {
          setEditError('Wallet not connected or vault address missing')
          setSaving(false)
          return
        }

        try {
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
          const tx = new Transaction()
          tx.recentBlockhash = blockhash
          tx.feePayer = publicKey

          if (pt === 'SOL') {
            // SOL: native transfer
            tx.add(
              SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: new PublicKey(task.vaultAddress),
                lamports: difference,
              })
            )
          } else {
            // USDC or CUSTOM: SPL token transfer to vault's ATA
            const mint = pt === 'CUSTOM' && task.customTokenMint
              ? new PublicKey(task.customTokenMint)
              : USDC_MINT
            const vaultPda = new PublicKey(task.vaultAddress)
            const creatorAta = getAta(publicKey, mint)
            const vaultAta = getAta(vaultPda, mint)
            tx.add(createTransferInstruction(creatorAta, vaultAta, publicKey, difference))
          }

          const sig = await sendTransaction(tx, connection)
          await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')

          updates.budgetLamports = newBudgetBaseUnits
          updates.budgetIncreaseTxSignature = sig
        } catch (err: any) {
          setEditError(err.message || 'Budget increase transaction failed')
          setSaving(false)
          return
        }
      }

      if (Object.keys(updates).length === 0) {
        setEditMode('none')
        setSaving(false)
        return
      }

      const res = await authFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Update failed')

      // Update local state
      const localUpdates: Partial<Task> = {}
      if (updates.title) localUpdates.title = updates.title
      if (updates.description) localUpdates.description = updates.description
      if (updates.deadlineAt !== undefined) localUpdates.deadlineAt = updates.deadlineAt
      if (updates.budgetLamports) {
        localUpdates.budgetLamports = String(updates.budgetLamports)
        // Also update remaining budget
        const increase = BigInt(updates.budgetLamports) - BigInt(task.budgetLamports)
        const newRemaining = BigInt(task.budgetRemainingLamports || task.budgetLamports) + increase
        localUpdates.budgetRemainingLamports = newRemaining.toString()
      }
      // Merge campaign config updates
      const hasConfigUpdate = updates.guidelines || updates.heading !== undefined || updates.collateralLink !== undefined || updates.minViews !== undefined || updates.minLikes !== undefined || updates.minRetweets !== undefined || updates.minComments !== undefined || updates.maxBudgetPerUserPercent !== undefined || updates.maxBudgetPerPostPercent !== undefined || updates.minKloutScore !== undefined || updates.requireFollowX !== undefined
      if (hasConfigUpdate) {
        const base = task.campaignConfig || { cpmLamports: '0', budgetRemainingLamports: task.budgetLamports, guidelines: { dos: [], donts: [] }, minViews: 100, minLikes: 0, minRetweets: 0, minComments: 0, minPayoutLamports: '0' }
        localUpdates.campaignConfig = {
          ...base,
          ...(updates.guidelines ? { guidelines: updates.guidelines } : {}),
          ...(updates.heading !== undefined ? { heading: updates.heading } : {}),
          ...(updates.collateralLink !== undefined ? { collateralLink: updates.collateralLink } : {}),
          ...(updates.minViews !== undefined ? { minViews: updates.minViews } : {}),
          ...(updates.minLikes !== undefined ? { minLikes: updates.minLikes } : {}),
          ...(updates.minRetweets !== undefined ? { minRetweets: updates.minRetweets } : {}),
          ...(updates.minComments !== undefined ? { minComments: updates.minComments } : {}),
          ...(updates.maxBudgetPerUserPercent !== undefined ? { maxBudgetPerUserPercent: updates.maxBudgetPerUserPercent } : {}),
          ...(updates.maxBudgetPerPostPercent !== undefined ? { maxBudgetPerPostPercent: updates.maxBudgetPerPostPercent } : {}),
          ...(updates.minKloutScore !== undefined ? { minKloutScore: updates.minKloutScore } : {}),
          ...(updates.requireFollowX !== undefined ? { requireFollowX: updates.requireFollowX } : {}),
        }
      }

      onTaskUpdate(task.id, localUpdates)
      setEditMode('none')
      setEditBudget('')
    } catch (err: any) {
      setEditError(err.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-k-border bg-surface overflow-hidden">
      {/* Image Section */}
      <div className="relative h-[300px] sm:h-[420px] lg:h-[552px] bg-zinc-900">
        {editingImagePosition && task.imageUrl ? (
          <ImagePositionEditor
            imageUrl={task.imageUrl}
            initialTransform={imageTransform}
            onTransformChange={setImageTransform}
            onSave={handleSaveImagePosition}
            onCancel={() => { setImageTransform(task.imageTransform as ImageTransform || { scale: 1, x: 50, y: 50 }); setEditingImagePosition(false) }}
            height="h-[300px] sm:h-[420px] lg:h-[552px]"
          />
        ) : task.imageUrl ? (
          <>
            <img
              src={task.imageUrl}
              alt={task.title}
              className="h-full w-full object-cover"
              style={getImageTransformStyle(task.imageTransform as ImageTransform)}
            />
            {/* Image action buttons */}
            <div className="absolute bottom-2 right-2 flex gap-1">
              <button
                onClick={() => setEditingImagePosition(true)}
                className="rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white hover:bg-black/80 backdrop-blur-sm"
              >
                Reposition
              </button>
              <button
                onClick={() => setEditMode('image')}
                className="rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white hover:bg-black/80 backdrop-blur-sm"
              >
                Change
              </button>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <button
              onClick={() => setEditMode('image')}
              className="flex flex-col items-center gap-1 text-zinc-500 hover:text-accent transition"
            >
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">Add Image</span>
            </button>
          </div>
        )}

        {/* Image upload overlay */}
        {editMode === 'image' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-black hover:bg-accent-hover disabled:opacity-50">
              {uploading ? 'Uploading...' : 'Upload New'}
            </button>
            {task.imageUrl && (
              <button onClick={handleRemoveImage} disabled={uploading} className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50">
                Remove
              </button>
            )}
            <button onClick={() => setEditMode('none')} className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-600">
              Cancel
            </button>
          </div>
        )}

        {/* Countdown badge */}
        {!editingImagePosition && countdown && (
          <div className={`absolute top-2 left-2 rounded-lg px-2 py-1 text-xs font-medium backdrop-blur-sm ${countdown.isEnded ? 'bg-red-500/90 text-white' : 'bg-black/70 text-white'}`}>
            {countdown.label}
          </div>
        )}

        {/* Status badge */}
        {!editingImagePosition && (
          <span className={`absolute top-2 right-2 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status] || ''}`}>
            {task.status.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {editMode === 'details' ? (
          /* Edit Form */
          <div className="space-y-3">
            {editError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-400">{editError}</div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Campaign Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Campaign title"
                maxLength={200}
                className="w-full rounded-lg border border-k-border bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-k-border bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Card Heading</label>
              <input
                type="text"
                value={editHeading}
                onChange={(e) => setEditHeading(e.target.value)}
                placeholder="Short headline for campaign card"
                maxLength={120}
                className="w-full rounded-lg border border-k-border bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
              />
              <p className="mt-0.5 text-[10px] text-zinc-600">Shown on the campaign card instead of description. Leave empty to use description.</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Guidelines — Do&apos;s</label>
              {editDos.map((d, i) => (
                <div key={i} className="mb-1 flex gap-1">
                  <input
                    type="text" value={d}
                    onChange={(e) => { const n = [...editDos]; n[i] = e.target.value; setEditDos(n) }}
                    placeholder={`Guideline ${i + 1}`}
                    className="flex-1 rounded-lg border border-k-border bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none"
                  />
                  {editDos.length > 1 && (
                    <button type="button" onClick={() => setEditDos(editDos.filter((_, j) => j !== i))} className="px-1 text-red-400 text-xs">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setEditDos([...editDos, ''])} className="text-[10px] text-accent hover:text-accent-hover">+ Add</button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Guidelines — Don&apos;ts</label>
              {editDonts.map((d, i) => (
                <div key={i} className="mb-1 flex gap-1">
                  <input
                    type="text" value={d}
                    onChange={(e) => { const n = [...editDonts]; n[i] = e.target.value; setEditDonts(n) }}
                    placeholder={`Don't ${i + 1}`}
                    className="flex-1 rounded-lg border border-k-border bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none"
                  />
                  {editDonts.length > 1 && (
                    <button type="button" onClick={() => setEditDonts(editDonts.filter((_, j) => j !== i))} className="px-1 text-red-400 text-xs">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setEditDonts([...editDonts, ''])} className="text-[10px] text-accent hover:text-accent-hover">+ Add</button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Collateral Link — optional</label>
              <input
                type="url"
                value={editCollateralLink}
                onChange={(e) => setEditCollateralLink(e.target.value)}
                placeholder="https://drive.google.com/... or https://dropbox.com/..."
                className="w-full rounded-lg border border-k-border bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
              />
              <p className="mt-0.5 text-[10px] text-zinc-600">Link to images, logos, or other assets creators can use. Not checked by AI verification.</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Minimum Engagement Thresholds</label>
              <p className="mb-2 text-[10px] text-zinc-600">Posts must meet all minimums. Set to 0 to skip.</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-500">Views</label>
                  <input type="number" min="0" step="1" value={editMinViews} onChange={(e) => setEditMinViews(e.target.value)} placeholder="100"
                    className="w-full rounded-lg border border-k-border bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-500">Likes</label>
                  <input type="number" min="0" step="1" value={editMinLikes} onChange={(e) => setEditMinLikes(e.target.value)} placeholder="0"
                    className="w-full rounded-lg border border-k-border bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-500">Retweets</label>
                  <input type="number" min="0" step="1" value={editMinRetweets} onChange={(e) => setEditMinRetweets(e.target.value)} placeholder="0"
                    className="w-full rounded-lg border border-k-border bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-500">Comments</label>
                  <input type="number" min="0" step="1" value={editMinComments} onChange={(e) => setEditMinComments(e.target.value)} placeholder="0"
                    className="w-full rounded-lg border border-k-border bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none" />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Budget Caps — optional</label>
              <p className="mb-2 text-[10px] text-zinc-600">Limit how much of the total budget a single user or post can consume. Leave empty for no limit.</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-500">Max per user (%)</label>
                  <div className="relative">
                    <input type="number" min="1" max="100" step="0.1" value={editMaxBudgetPerUser} onChange={(e) => setEditMaxBudgetPerUser(e.target.value)} placeholder="No limit"
                      className="w-full rounded-lg border border-k-border bg-zinc-900 px-2 py-1 pr-7 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none" />
                    {editMaxBudgetPerUser && (
                      <button type="button" onClick={() => setEditMaxBudgetPerUser('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs" title="Remove limit">✕</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-500">Max per post (%)</label>
                  <div className="relative">
                    <input type="number" min="0.1" max="100" step="0.1" value={editMaxBudgetPerPost} onChange={(e) => setEditMaxBudgetPerPost(e.target.value)} placeholder="No limit"
                      className="w-full rounded-lg border border-k-border bg-zinc-900 px-2 py-1 pr-7 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none" />
                    {editMaxBudgetPerPost && (
                      <button type="button" onClick={() => setEditMaxBudgetPerPost('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs" title="Remove limit">✕</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Minimum Klout Score — optional</label>
              <input type="number" min="0" max="10000" step="1" value={editMinKloutScore} onChange={(e) => setEditMinKloutScore(e.target.value)} placeholder="No minimum"
                className="w-full rounded-lg border border-k-border bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none" />
              <p className="mt-0.5 text-[10px] text-zinc-600">Participants must have at least this Klout score. Leave empty for no requirement.</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Require Follow on X — optional</label>
              <input type="text" value={editRequireFollowX} onChange={(e) => setEditRequireFollowX(e.target.value)} placeholder="@yourhandle"
                className="w-full rounded-lg border border-k-border bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:border-accent/50 focus:outline-none" />
              <p className="mt-0.5 text-[10px] text-zinc-600">Participants will be prompted to follow this X account. Leave empty for no requirement.</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">End Date (optional)</label>
              <input
                type="datetime-local"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
                className="w-full rounded-lg border border-k-border bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:border-accent/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Increase Budget (current: {currentBudgetHuman.toFixed(4)} {sym})
              </label>
              <input
                type="number" step="0.01" min={currentBudgetHuman + 0.01}
                value={editBudget}
                onChange={(e) => setEditBudget(e.target.value)}
                placeholder={`> ${currentBudgetHuman.toFixed(4)} ${sym}`}
                className="w-full rounded-lg border border-k-border bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/50 focus:outline-none"
              />
              <p className="mt-0.5 text-[10px] text-zinc-600">
                Budget can only be increased. A {sym} transfer for the difference will be sent to the campaign vault.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveDetails}
                disabled={saving}
                className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black transition hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => { setEditMode('none'); setEditError('') }}
                disabled={saving}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Normal View */
          <>
            <div className="flex items-start justify-between gap-2">
              <Link href={`/tasks/${task.id}`} className="hover:underline min-w-0">
                <h3 className="font-semibold text-zinc-100 truncate">{task.title}</h3>
              </Link>
              <button
                onClick={() => {
                  setEditDescription(task.description)
                  setEditHeading(task.campaignConfig?.heading || '')
                  setEditDos((task.campaignConfig?.guidelines?.dos || []).length > 0 ? task.campaignConfig!.guidelines.dos : [''])
                  setEditDonts((task.campaignConfig?.guidelines?.donts || []).length > 0 ? task.campaignConfig!.guidelines.donts : [''])
                  setEditMinViews(String(task.campaignConfig?.minViews ?? 100))
                  setEditMinLikes(String(task.campaignConfig?.minLikes ?? 0))
                  setEditMinRetweets(String(task.campaignConfig?.minRetweets ?? 0))
                  setEditMinComments(String(task.campaignConfig?.minComments ?? 0))
                  setEditCollateralLink(task.campaignConfig?.collateralLink || '')
                  setEditDeadline(task.deadlineAt ? new Date(task.deadlineAt).toISOString().slice(0, 16) : '')
                  setEditBudget('')
                  setEditError('')
                  setEditMode('details')
                }}
                className="shrink-0 rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 transition"
              >
                Edit
              </button>
            </div>

            {/* Budget Progress */}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Budget Used</span>
                <span className="font-medium text-zinc-300">
                  {formatTokenAmount(budgetRemaining, tInfo)} {sym} / {formatTokenAmount(task.budgetLamports, tInfo)} {sym}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${budgetUsedPercent}%` }} />
              </div>
            </div>

            {/* Stats */}
            <div className="mt-3 flex items-center gap-4 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {task.submissionCount ?? task.bidCount} participants
              </span>
              <span>{new Date(task.createdAt).toLocaleDateString()}</span>
            </div>

            <Link
              href={`/tasks/${task.id}`}
              className="mt-3 block w-full rounded-lg bg-accent py-2 text-center text-sm font-semibold text-black transition hover:bg-accent-hover"
            >
              View Campaign
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { isAuthenticated, connected, wallet, authFetch } = useAuth()
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [myBids, setMyBids] = useState<Bid[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [loadingBids, setLoadingBids] = useState(true)
  const [activeTab, setActiveTab] = useState<'tasks' | 'bids'>('tasks')

  useEffect(() => {
    if (!isAuthenticated) return

    const fetchTasks = async () => {
      setLoadingTasks(true)
      try {
        const params = new URLSearchParams({ limit: '50', taskType: 'CAMPAIGN' })
        const res = await authFetch(`/api/me/tasks?${params}`)
        const data = await res.json()
        if (data.success) {
          setMyTasks(data.tasks)
        }
      } catch {
        // ignore
      } finally {
        setLoadingTasks(false)
      }
    }

    const fetchBids = async () => {
      setLoadingBids(true)
      try {
        const res = await authFetch('/api/me/bids?limit=50&taskType=CAMPAIGN')
        const data = await res.json()
        if (data.success) {
          setMyBids(data.bids)
        }
      } catch {
        // ignore
      } finally {
        setLoadingBids(false)
      }
    }

    fetchTasks()
    fetchBids()
  }, [isAuthenticated, authFetch])

  if (!isAuthenticated) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-4 text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-500">Connect your wallet to view your dashboard.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <Link
          href="/tasks/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-accent-hover text-center sm:text-left"
        >
          Create Campaign
        </Link>
      </div>

      <div className="mb-6 rounded-lg bg-surface border border-k-border px-4 py-3 text-sm text-zinc-400 overflow-hidden">
        Wallet: <Link href={`/u/${wallet}`} className="font-mono hover:text-accent break-all">{wallet}</Link>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-k-border">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'tasks'
              ? 'border-accent text-accent'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          My Campaigns ({myTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('bids')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'bids'
              ? 'border-accent text-accent'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          My Submissions ({myBids.length})
        </button>
      </div>

      {/* My Campaigns Tab */}
      {activeTab === 'tasks' && (
        <section>
          {loadingTasks ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-xl bg-surface" />
              ))}
            </div>
          ) : myTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-k-border p-8 text-center">
              <p className="text-zinc-500 mb-4">You haven&apos;t created any campaigns yet.</p>
              <Link
                href="/tasks/new"
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover"
              >
                Create Your First Campaign
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myTasks.map((task) => (
                <CampaignCard
                  key={task.id}
                  task={task}
                  authFetch={authFetch}
                  onTaskUpdate={(taskId, updates) => {
                    setMyTasks(prev => prev.map(t =>
                      t.id === taskId ? { ...t, ...updates } : t
                    ))
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* My Submissions Tab */}
      {activeTab === 'bids' && (
        <section>
          {loadingBids ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
              ))}
            </div>
          ) : myBids.length === 0 ? (
            <div className="rounded-xl border border-dashed border-k-border p-8 text-center">
              <p className="text-zinc-500 mb-4">You haven&apos;t submitted to any campaigns yet.</p>
              <Link
                href="/tasks"
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover"
              >
                Browse Campaigns
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {myBids.map((bid) => (
                <Link
                  key={bid.id}
                  href={`/tasks/${bid.task.id}`}
                  className="block rounded-xl border border-k-border bg-surface p-4 hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-zinc-100 truncate">
                        {bid.task.title}
                      </h3>
                      <p className="text-sm text-zinc-500">Campaign budget: {formatSol(bid.task.budgetLamports)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${BID_STATUS_COLORS[bid.status]}`}>
                        {bid.status.replace('_', ' ')}
                      </span>
                      {bid.isWinningBid && (
                        <span className="text-xs text-green-400 font-medium">
                          Winning Bid
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">
                      Your bid: <span className="font-semibold text-zinc-100">{formatSol(bid.amountLamports)}</span>
                    </span>
                    <span className="text-zinc-500">
                      {new Date(bid.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
