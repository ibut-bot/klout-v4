'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { useRouter } from 'next/navigation'
import { createMultisigVaultAndFundWA } from '@/lib/solana/multisig'
import { createMultisigVaultAndFundSplWA, USDC_MINT, getAta } from '@/lib/solana/spl-token'
import { type PaymentTokenType, resolveTokenInfo } from '@/lib/token-utils'
import { fetchTokenMetadata, type SplTokenMetadata } from '@/lib/solana/token-metadata'
import ImagePositionEditor, { type ImageTransform } from './ImagePositionEditor'

const SYSTEM_WALLET = process.env.NEXT_PUBLIC_SYSTEM_WALLET_ADDRESS || ''
const TASK_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_TASK_FEE_LAMPORTS || 10000000)
const CAMPAIGN_CREATION_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_CAMPAIGN_CREATION_FEE_LAMPORTS || 1_000_000_000)

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
  const [platform, setPlatform] = useState<'X' | 'YOUTUBE'>('X')
  const [durationDays, setDurationDays] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'paying' | 'creating'>('form')

  // Payment token selector (campaign + competition)
  const [paymentToken, setPaymentToken] = useState<PaymentTokenType>('SOL')
  const [customMint, setCustomMint] = useState('')
  const [customTokenMeta, setCustomTokenMeta] = useState<SplTokenMetadata | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [tokenError, setTokenError] = useState('')

  // Fetch metadata when user enters a custom mint address
  useEffect(() => {
    if (paymentToken !== 'CUSTOM' || customMint.length < 32) {
      setCustomTokenMeta(null)
      setTokenError('')
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setTokenLoading(true)
      setTokenError('')
      try {
        const meta = await fetchTokenMetadata(connection, customMint)
        if (!cancelled) setCustomTokenMeta(meta)
      } catch (e: any) {
        if (!cancelled) {
          setTokenError(e.message || 'Failed to fetch token info')
          setCustomTokenMeta(null)
        }
      } finally {
        if (!cancelled) setTokenLoading(false)
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [paymentToken, customMint, connection])

  // Wallet balance for the selected token
  const [walletBalance, setWalletBalance] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  useEffect(() => {
    if (!publicKey || (taskType !== 'CAMPAIGN' && taskType !== 'COMPETITION')) { setWalletBalance(null); return }
    let cancelled = false
    const fetchBalance = async () => {
      setBalanceLoading(true)
      try {
        if (paymentToken === 'SOL') {
          const lamports = await connection.getBalance(publicKey)
          if (!cancelled) setWalletBalance((lamports / LAMPORTS_PER_SOL).toString())
        } else {
          const mint = paymentToken === 'USDC'
            ? USDC_MINT
            : customTokenMeta ? new PublicKey(customTokenMeta.mint) : null
          if (!mint) { if (!cancelled) setWalletBalance(null); return }
          try {
            const ata = getAta(publicKey, mint)
            const info = await connection.getTokenAccountBalance(ata)
            if (!cancelled) setWalletBalance(info.value.uiAmountString ?? '0')
          } catch {
            // ATA doesn't exist — balance is 0
            if (!cancelled) setWalletBalance('0')
          }
        }
      } catch {
        if (!cancelled) setWalletBalance(null)
      } finally {
        if (!cancelled) setBalanceLoading(false)
      }
    }
    fetchBalance()
    return () => { cancelled = true }
  }, [publicKey, paymentToken, customTokenMeta, connection, taskType])

  // Resolved token info for display labels
  const tokenInfo = resolveTokenInfo(
    paymentToken,
    customTokenMeta?.mint,
    customTokenMeta?.symbol,
    customTokenMeta?.decimals,
  )
  const tokenLabel = tokenInfo.symbol

  // Campaign-specific fields
  const [cpm, setCpm] = useState('')
  const [heading, setHeading] = useState('')
  const [minViews, setMinViews] = useState('100')
  const [minLikes, setMinLikes] = useState('0')
  const [minRetweets, setMinRetweets] = useState('0')
  const [minComments, setMinComments] = useState('0')
  const [minPayout, setMinPayout] = useState('')
  const [maxBudgetPerUser, setMaxBudgetPerUser] = useState('')
  const [maxBudgetPerPost, setMaxBudgetPerPost] = useState('')
  const [minKloutScore, setMinKloutScore] = useState('')
  const [requireFollowX, setRequireFollowX] = useState('')
  const [bonusMinKloutScore, setBonusMinKloutScore] = useState('')
  const [bonusMax, setBonusMax] = useState('')
  const [dos, setDos] = useState<string[]>([''])
  const [donts, setDonts] = useState<string[]>([''])
  const [collateralLink, setCollateralLink] = useState('')

  // Shared campaign/competition fields
  const [allowPreLivePosts, setAllowPreLivePosts] = useState(false)

  // Competition-specific fields
  const [maxWinners, setMaxWinners] = useState(1)
  const [prizeAmounts, setPrizeAmounts] = useState<string[]>([''])
  const [isPublicFeed, setIsPublicFeed] = useState(false)

  const updatePrizeCount = (count: number) => {
    setMaxWinners(count)
    setPrizeAmounts(prev => {
      const next = [...prev]
      while (next.length < count) next.push('')
      return next.slice(0, count)
    })
  }

  const totalPrizeSol = prizeAmounts.reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

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
      if ((taskType === 'CAMPAIGN' || taskType === 'COMPETITION') && paymentToken === 'CUSTOM' && !customTokenMeta) {
        throw new Error('Please enter a valid token mint address first')
      }
      const multiplier = (taskType === 'CAMPAIGN' || taskType === 'COMPETITION') ? tokenInfo.multiplier : LAMPORTS_PER_SOL

      let budgetLamports: number
      if (taskType === 'COMPETITION') {
        budgetLamports = Math.round(totalPrizeSol * multiplier)
        if (isNaN(budgetLamports) || budgetLamports <= 0) throw new Error('Total prize amount must be positive')
        if (prizeAmounts.some(v => !v || parseFloat(v) <= 0)) throw new Error('All prize amounts must be positive')
      } else {
        budgetLamports = Math.round(parseFloat(budget) * multiplier)
        if (isNaN(budgetLamports) || budgetLamports <= 0) throw new Error('Invalid budget')
      }

      // Upload image first if provided
      let imageUrl: string | null = null
      if (imageFile) {
        imageUrl = await uploadImage()
      }

      let signature: string
      let vaultDetails: { multisigAddress?: string; vaultAddress?: string } = {}

      if (taskType === 'COMPETITION' || taskType === 'CAMPAIGN') {
        if (!signTransaction) throw new Error('Wallet does not support signing')
        setStep('paying')
        const walletSigner = { publicKey, signTransaction }

        // For campaigns, include a 1 SOL creation fee in the same transaction
        const extraIx = taskType === 'CAMPAIGN' && SYSTEM_WALLET
          ? [SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: new PublicKey(SYSTEM_WALLET),
              lamports: CAMPAIGN_CREATION_FEE_LAMPORTS,
            })]
          : []

        let result: { multisigPda: { toBase58(): string }; vaultPda: { toBase58(): string }; signature: string }
        if (paymentToken === 'USDC') {
          result = await createMultisigVaultAndFundSplWA(connection, walletSigner, budgetLamports, USDC_MINT, extraIx)
        } else if (paymentToken === 'CUSTOM' && customTokenMeta) {
          result = await createMultisigVaultAndFundSplWA(connection, walletSigner, budgetLamports, new PublicKey(customTokenMeta.mint), extraIx)
        } else {
          result = await createMultisigVaultAndFundWA(connection, walletSigner, budgetLamports, extraIx)
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
        allowPreLivePosts,
        ...(paymentToken === 'CUSTOM' && customTokenMeta ? {
          customTokenMint: customTokenMeta.mint,
          customTokenSymbol: customTokenMeta.symbol,
          customTokenDecimals: customTokenMeta.decimals,
          ...(customTokenMeta.logoUri ? { customTokenLogoUri: customTokenMeta.logoUri } : {}),
        } : {}),
        cpmLamports: Math.round(parseFloat(cpm) * multiplier),
        ...(heading.trim() ? { heading: heading.trim() } : {}),
        minViews: parseInt(minViews) || 100,
        minLikes: parseInt(minLikes) || 0,
        minRetweets: parseInt(minRetweets) || 0,
        minComments: parseInt(minComments) || 0,
        ...(minPayout ? { minPayoutLamports: Math.round(parseFloat(minPayout) * multiplier) } : {}),
        ...(maxBudgetPerUser && parseFloat(maxBudgetPerUser) > 0 ? { maxBudgetPerUserPercent: parseFloat(maxBudgetPerUser) } : {}),
        ...(maxBudgetPerPost && parseFloat(maxBudgetPerPost) > 0 ? { maxBudgetPerPostPercent: parseFloat(maxBudgetPerPost) } : {}),
        ...(minKloutScore && parseInt(minKloutScore) > 0 ? { minKloutScore: parseInt(minKloutScore) } : {}),
        ...(requireFollowX.trim() ? { requireFollowX: requireFollowX.trim().replace(/^@/, '') } : {}),
        ...(collateralLink.trim() ? { collateralLink: collateralLink.trim() } : {}),
        ...(bonusMinKloutScore && parseInt(bonusMinKloutScore) > 0 && bonusMax && parseFloat(bonusMax) > 0 ? {
          bonusMinKloutScore: parseInt(bonusMinKloutScore),
          bonusMaxLamports: Math.round(parseFloat(bonusMax) * multiplier),
        } : {}),
        guidelines: {
          dos: dos.map(d => d.trim()).filter(Boolean),
          donts: donts.map(d => d.trim()).filter(Boolean),
        },
      } : {}

      const competitionFields = taskType === 'COMPETITION' ? {
        maxWinners,
        isPublicFeed,
        allowPreLivePosts,
        paymentToken,
        ...(paymentToken === 'CUSTOM' && customTokenMeta ? {
          customTokenMint: customTokenMeta.mint,
          customTokenSymbol: customTokenMeta.symbol,
          customTokenDecimals: customTokenMeta.decimals,
          ...(customTokenMeta.logoUri ? { customTokenLogoUri: customTokenMeta.logoUri } : {}),
        } : {}),
        ...(maxWinners > 1 ? {
          prizeStructure: prizeAmounts.map((v, i) => ({
            place: i + 1,
            amountLamports: Math.round(parseFloat(v) * multiplier),
          })),
        } : {}),
      } : {}

      const res = await authFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title, description, budgetLamports, taskType, platform,
          paymentTxSignature: signature,
          ...vaultDetails,
          ...campaignFields,
          ...competitionFields,
          ...((taskType === 'COMPETITION' || taskType === 'CAMPAIGN') && durationDays ? { durationDays: parseInt(durationDays) } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          ...(imageUrl && (imageTransform.scale !== 1 || imageTransform.x !== 0 || imageTransform.y !== 0) ? { imageTransform } : {}),
        }),
      })
      const data = await res.json()

      if (!data.success) throw new Error(data.message)

      router.push(`/tasks/${data.task.id}`)
    } catch (e: any) {
      setError(e.message || `Failed to create ${taskType === 'COMPETITION' ? 'competition' : 'campaign'}`)
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

      {/* Task Type Selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-200">Type</label>
        <div className="flex gap-2">
          {(['CAMPAIGN', 'COMPETITION'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTaskType(t)}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                taskType === t
                  ? t === 'COMPETITION'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                    : 'border-accent bg-accent/10 text-accent'
                  : 'border-k-border bg-surface text-zinc-400 hover:border-zinc-500'
              }`}
            >
              {t === 'CAMPAIGN' ? 'Campaign' : 'Competition'}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {taskType === 'CAMPAIGN'
            ? 'Pay-per-view campaign. Participants earn based on engagement.'
            : 'Contest with prizes. Participants submit work and you pick winners.'}
        </p>
      </div>

      {/* Platform Selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-200">Platform</label>
        <div className="flex gap-2">
          {(['X', 'YOUTUBE'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                platform === p
                  ? p === 'YOUTUBE'
                    ? 'border-red-500 bg-red-500/10 text-red-400'
                    : 'border-accent bg-accent/10 text-accent'
                  : 'border-k-border bg-surface text-zinc-400 hover:border-zinc-500'
              }`}
            >
              {p === 'X' ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              )}
              {p === 'X' ? 'X (Twitter)' : 'YouTube'}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {platform === 'X'
            ? 'Participants will submit X (Twitter) posts.'
            : 'Participants will submit YouTube videos.'}
        </p>
      </div>

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
        <label className="mb-1.5 block text-sm font-medium text-zinc-200">{taskType === 'COMPETITION' ? 'Competition Details' : 'Campaign Details'}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={taskType === 'COMPETITION' ? 'Describe the competition, rules, and what you expect from submissions...' : 'Describe the campaign in detail...'}
          rows={5}
          required
          className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-200">{taskType === 'COMPETITION' ? 'Competition Image' : 'Campaign Image'}</label>
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
              <span className="text-xs text-zinc-400">Position and zoom your image for the card</span>
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
              <span className="mt-1 block text-xs">Upload {taskType === 'COMPETITION' ? 'competition' : 'campaign'} image</span>
            </div>
          </button>
        )}
        <p className="mt-1 text-xs text-zinc-500">Optional. This image will be shown on the card. You can position and zoom it.</p>
      </div>

      {(taskType === 'CAMPAIGN' || taskType === 'COMPETITION') && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-200">{taskType === 'COMPETITION' ? 'Prize Token' : 'Bounty Token'}</label>
          <div className="flex gap-2">
            {(['SOL', 'USDC', 'CUSTOM'] as const).map((t) => (
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
                {t === 'CUSTOM' ? 'Custom SPL' : t}
              </button>
            ))}
          </div>
          {paymentToken === 'CUSTOM' && (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={customMint}
                onChange={(e) => setCustomMint(e.target.value.trim())}
                placeholder="Token mint address (e.g. DezX...)"
                className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
              />
              {tokenLoading && (
                <p className="text-xs text-zinc-500">Looking up token info...</p>
              )}
              {tokenError && (
                <p className="text-xs text-red-400">{tokenError}</p>
              )}
              {customTokenMeta && (
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    {customTokenMeta.logoUri && (
                      <img src={customTokenMeta.logoUri} alt={customTokenMeta.symbol} className="h-6 w-6 rounded-full" />
                    )}
                    <span className="text-sm font-semibold text-accent">{customTokenMeta.symbol}</span>
                    <span className="text-xs text-zinc-400">{customTokenMeta.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500">Decimals: {customTokenMeta.decimals}</p>
                  <p className="text-xs text-zinc-500 font-mono break-all">Mint: {customTokenMeta.mint}</p>
                </div>
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-zinc-500">{taskType === 'COMPETITION' ? 'All prizes will be denominated in the selected token.' : 'All bounty payouts, CPM, and platform fees will be denominated in the selected token.'}</p>
        </div>
      )}

      {/* Competition: Prize Structure */}
      {taskType === 'COMPETITION' && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-200">Number of Winners</label>
          <input
            type="number"
            step="1"
            min="1"
            max="10"
            value={maxWinners}
            onChange={(e) => updatePrizeCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
            className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <p className="mt-1 text-xs text-zinc-500">How many winners you will select (1-10).</p>
        </div>
      )}

      {taskType === 'COMPETITION' && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-200">Prize Amounts ({tokenLabel})</label>
          <div className="space-y-2">
            {prizeAmounts.map((amt, i) => {
              const placeLabels = ['1st', '2nd', '3rd']
              const label = i < 3 ? `${placeLabels[i]} Place` : `${i + 1}th Place`
              return (
                <div key={i}>
                  <label className="mb-1 block text-xs text-zinc-400">{label}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amt}
                    onChange={(e) => {
                      const next = [...prizeAmounts]
                      next[i] = e.target.value
                      setPrizeAmounts(next)
                    }}
                    placeholder="0.5"
                    required
                    className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-surface p-3 border border-k-border">
            <span className="text-sm font-medium text-zinc-300">Total Budget</span>
            <span className="text-sm font-bold text-accent">{totalPrizeSol > 0 ? totalPrizeSol.toFixed(4) : '0'} {tokenLabel}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">This total will be locked in an escrow vault when you create the competition.</p>
        </div>
      )}

      {taskType === 'COMPETITION' && (
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              role="switch"
              aria-checked={isPublicFeed}
              onClick={() => setIsPublicFeed(!isPublicFeed)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${isPublicFeed ? 'bg-accent' : 'bg-zinc-700'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${isPublicFeed ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
            <div>
              <span className="text-sm font-medium text-zinc-200">Show entries in public feed</span>
              <p className="text-xs text-zinc-500">Allow competition entries to appear on the Klout social feed</p>
            </div>
          </label>
        </div>
      )}

      {/* Campaign: Budget */}
      {taskType !== 'COMPETITION' && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium text-zinc-200">Budget ({taskType === 'CAMPAIGN' ? tokenLabel : 'SOL'})</label>
            {taskType === 'CAMPAIGN' && walletBalance !== null && (
              <span className="text-xs text-zinc-400">
                Balance: {balanceLoading ? '...' : <span className="text-zinc-200">{parseFloat(walletBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>} {tokenLabel}
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="0.5"
              required
              className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 pr-16 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            {taskType === 'CAMPAIGN' && walletBalance !== null && parseFloat(walletBalance) > 0 && (
              <button
                type="button"
                onClick={() => setBudget(walletBalance)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/25 transition"
              >
                Max
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {taskType === 'CAMPAIGN'
              ? `This ${tokenLabel} budget will be locked in an escrow vault. A ${CAMPAIGN_CREATION_FEE_LAMPORTS / LAMPORTS_PER_SOL} SOL campaign creation fee applies.`
              : `A fee of ${TASK_FEE_LAMPORTS / LAMPORTS_PER_SOL} SOL will be charged to post this campaign.`}
          </p>
        </div>
      )}

      {taskType === 'CAMPAIGN' && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">CPM — Cost per 1,000 views ({tokenLabel})</label>
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
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Minimum Payout Threshold ({tokenLabel}) — optional</label>
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
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Budget Caps — optional</label>
            <p className="mb-3 text-xs text-zinc-500">Limit how much of the total budget a single user or post can consume. Leave empty for no limit.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Max per top user (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="100"
                  value={maxBudgetPerUser}
                  onChange={(e) => setMaxBudgetPerUser(e.target.value)}
                  placeholder="10"
                  className="w-full rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
                />
                <p className="mt-0.5 text-[10px] text-zinc-600">{platform === 'YOUTUBE' ? 'Max % of total budget a single user can earn. Defaults to 10%.' : 'Ceiling for top Klout score users. Lower scores are scaled down. Defaults to 10%.'}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Max per post (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={maxBudgetPerPost}
                  onChange={(e) => setMaxBudgetPerPost(e.target.value)}
                  placeholder="No limit"
                  className="w-full rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
                />
                <p className="mt-0.5 text-[10px] text-zinc-600">Max % of total budget one post can earn</p>
              </div>
            </div>
          </div>

          {platform !== 'YOUTUBE' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Minimum Klout Score — optional</label>
            <input
              type="number"
              step="1"
              min="0"
              max="10000"
              value={minKloutScore}
              onChange={(e) => setMinKloutScore(e.target.value)}
              placeholder="No minimum"
              className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <p className="mt-1 text-xs text-zinc-500">Participants must have at least this Klout score to submit. Leave empty for no requirement.</p>
          </div>
          )}

          {platform !== 'YOUTUBE' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Klout Score Bonus — optional</label>
            <p className="mb-3 text-xs text-zinc-500">Offer a one-time flat bonus to high Klout score users on their first submission. The bonus scales exponentially — top scorers get the full amount, lower-eligible users get less. Both fields are required to enable the bonus.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Min score for bonus</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="10000"
                  value={bonusMinKloutScore}
                  onChange={(e) => setBonusMinKloutScore(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
                />
                <p className="mt-0.5 text-[10px] text-zinc-600">Users above this score get the bonus on their first post</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Max bonus ({tokenLabel})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bonusMax}
                  onChange={(e) => setBonusMax(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border border-k-border bg-surface px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none"
                />
                <p className="mt-0.5 text-[10px] text-zinc-600">Max bonus for a 10,000 Klout user. Lower scores get proportionally less.</p>
              </div>
            </div>
          </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-200">Require Follow on X — optional</label>
            <input
              type="text"
              value={requireFollowX}
              onChange={(e) => setRequireFollowX(e.target.value)}
              placeholder="@yourhandle"
              className="w-full rounded-lg border border-k-border bg-surface px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-300 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <p className="mt-1 text-xs text-zinc-500">Participants will be prompted to follow this X account before submitting. Leave empty for no requirement.</p>
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
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              role="switch"
              aria-checked={allowPreLivePosts}
              onClick={() => setAllowPreLivePosts(!allowPreLivePosts)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${allowPreLivePosts ? 'bg-accent' : 'bg-zinc-700'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${allowPreLivePosts ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
            <div>
              <span className="text-sm font-medium text-zinc-200">Accept pre-existing posts</span>
              <p className="text-xs text-zinc-500">Allow submissions of posts/videos created before the {taskType === 'COMPETITION' ? 'competition' : 'campaign'} went live</p>
            </div>
          </label>
        </div>
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
        className={`w-full rounded-lg py-3 text-sm font-semibold text-black transition disabled:opacity-50 ${
          taskType === 'COMPETITION'
            ? 'bg-amber-500 hover:bg-amber-400'
            : 'bg-accent hover:bg-accent-hover'
        }`}
      >
        {loading
          ? step === 'paying'
            ? 'Creating escrow vault...'
            : taskType === 'COMPETITION' ? 'Creating competition...' : 'Creating campaign...'
          : taskType === 'COMPETITION' ? 'Launch Competition' : 'Launch Campaign'}
      </button>
    </form>
  )
}
