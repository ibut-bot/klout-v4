'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import ImagePositionEditor, { getImageTransformStyle, type ImageTransform } from './ImagePositionEditor'
import { type PaymentTokenType, type TokenInfo, formatTokenAmount, resolveTokenInfo } from '@/lib/token-utils'

function TokenIcon({ token, size = 16, logoUri }: { token: PaymentTokenType; size?: number; logoUri?: string | null }) {
  if (token === 'CUSTOM' && logoUri) {
    return <img src={logoUri} alt="token" className="rounded-full" style={{ width: size, height: size }} />
  }
  if (token === 'CUSTOM') {
    // Generic token icon for custom tokens without a logo
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="15" stroke="#a1a1aa" strokeWidth="2" fill="none"/>
        <text x="16" y="21" textAnchor="middle" fontSize="14" fill="#a1a1aa" fontFamily="monospace">$</text>
      </svg>
    )
  }
  if (token === 'USDC') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="16" fill="#2775CA"/>
        <path d="M20.4 18.4c0-2.2-1.3-2.9-3.9-3.2-1.9-.3-2.2-.7-2.2-1.5s.7-1.3 1.8-1.3c1 0 1.6.4 1.8 1.2.1.1.2.2.3.2h.7c.2 0 .3-.2.3-.3-.2-1.1-1-2-2.2-2.2v-1.3c0-.2-.1-.3-.3-.3h-.6c-.2 0-.3.1-.3.3v1.3c-1.5.2-2.5 1.2-2.5 2.5 0 2 1.3 2.7 3.8 3 1.7.3 2.3.7 2.3 1.6 0 1-.8 1.7-2 1.7-1.5 0-2-.7-2.2-1.5 0-.2-.2-.2-.3-.2h-.8c-.2 0-.3.2-.3.3.2 1.3 1 2.2 2.6 2.5v1.3c0 .2.1.3.3.3h.6c.2 0 .3-.1.3-.3v-1.3c1.6-.2 2.6-1.3 2.6-2.7z" fill="#fff"/>
        <path d="M12.8 25c-4.5-1.6-6.8-6.5-5.3-11 .8-2.3 2.6-4.1 5-5 .2-.1.3-.2.3-.4v-.6c0-.2-.1-.3-.3-.3-.1 0-.1 0-.2 0-5.3 1.8-8.2 7.5-6.4 12.8 1.1 3.2 3.5 5.6 6.6 6.7.2.1.4 0 .4-.2v-.6c.1-.2 0-.3-.1-.4zm6.4-17c-.2-.1-.4 0-.4.2v.6c0 .2.2.3.3.4 4.5 1.6 6.8 6.5 5.3 11-.8 2.3-2.6 4.1-5 5-.2.1-.3.2-.3.4v.6c0 .2.1.3.3.3.1 0 .1 0 .2 0 5.3-1.8 8.2-7.5 6.4-12.8-1.1-3.2-3.5-5.7-6.8-6.7z" fill="#fff"/>
      </svg>
    )
  }
  // Official Solana logomark from solana.com/branding
  return (
    <svg width={size} height={size} viewBox="0 0 101 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M100.48 69.3817L83.8068 86.8015C83.4444 87.1799 83.0058 87.4816 82.5185 87.6878C82.0312 87.894 81.5055 88.0003 80.9743 88H1.93563C1.55849 88 1.18957 87.8926 0.874202 87.6912C0.558829 87.4897 0.31074 87.2029 0.160416 86.8659C0.0100923 86.529-0.0359181 86.1566 0.0280382 85.7945C0.0919944 85.4324 0.263131 85.0964 0.520422 84.8278L17.2061 67.408C17.5676 67.0306 18.0047 66.7295 18.4904 66.5234C18.9762 66.3172 19.5002 66.2104 20.0301 66.2095H99.0644C99.4415 66.2095 99.8104 66.3169 100.126 66.5183C100.441 66.7198 100.689 67.0067 100.84 67.3436C100.99 67.6806 101.036 68.0529 100.972 68.415C100.908 68.7771 100.737 69.1131 100.48 69.3817ZM83.8068 34.3032C83.4444 33.9248 83.0058 33.6231 82.5185 33.4169C82.0312 33.2108 81.5055 33.1045 80.9743 33.1048H1.93563C1.55849 33.1048 1.18957 33.2121 0.874202 33.4136C0.558829 33.6151 0.31074 33.9019 0.160416 34.2388C0.0100923 34.5758-0.0359181 34.9482 0.0280382 35.3103C0.0919944 35.6723 0.263131 36.0083 0.520422 36.277L17.2061 53.6968C17.5676 54.0742 18.0047 54.3752 18.4904 54.5814C18.9762 54.7875 19.5002 54.8944 20.0301 54.8952H99.0644C99.4415 54.8952 99.8104 54.7879 100.126 54.5864C100.441 54.3849 100.689 54.0981 100.84 53.7612C100.99 53.4242 101.036 53.0518 100.972 52.6897C100.908 52.3277 100.737 51.9917 100.48 51.723L83.8068 34.3032ZM1.93563 21.7905H80.9743C81.5055 21.7907 82.0312 21.6845 82.5185 21.4783C83.0058 21.2721 83.4444 20.9704 83.8068 20.592L100.48 3.17219C100.737 2.90357 100.908 2.56758 100.972 2.2055C101.036 1.84342 100.99 1.47103 100.84 1.13408C100.689 0.79713 100.441 0.510296 100.126 0.308823C99.8104 0.107349 99.4415 0 99.0644 0H20.0301C19.5002 0.000878 18.9762 0.1077 18.4904 0.313848C18.0047 0.52 17.5676 0.821087 17.2061 1.19848L0.524723 18.6183C0.267681 18.8866 0.0966198 19.2223 0.0325185 19.5839C-0.0315829 19.9456 0.0140624 20.3177 0.163856 20.6545C0.31365 20.9913 0.561081 21.2781 0.875804 21.4799C1.19053 21.6817 1.55886 21.7896 1.93563 21.7905Z" fill="url(#paint0_linear_174_4403)"/>
      <defs>
        <linearGradient id="paint0_linear_174_4403" x1="8.52558" y1="90.0973" x2="88.9933" y2="-3.01622" gradientUnits="userSpaceOnUse">
          <stop offset="0.08" stopColor="#9945FF"/><stop offset="0.3" stopColor="#8752F3"/><stop offset="0.5" stopColor="#5497D5"/><stop offset="0.6" stopColor="#43B4CA"/><stop offset="0.72" stopColor="#28E0B9"/><stop offset="0.97" stopColor="#19FB9B"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

interface TaskCardProps {
  id: string
  title: string
  description: string
  budgetLamports: string
  taskType?: string
  paymentToken?: string
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
  heading?: string | null
  imageUrl?: string | null
  imageTransform?: ImageTransform | null
  deadlineAt?: string | null
  createdAt: string
  isCreator?: boolean
  onImageTransformSave?: (taskId: string, transform: ImageTransform) => void
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-500/20 text-green-400',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-400',
  COMPLETED: 'bg-zinc-700/50 text-zinc-400',
  DISPUTED: 'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-zinc-700/50 text-zinc-500',
}

const TYPE_COLORS: Record<string, string> = {
  QUOTE: 'bg-indigo-500/20 text-indigo-400',
  COMPETITION: 'bg-amber-500/20 text-amber-400',
  CAMPAIGN: 'bg-accent/20 text-accent',
}

function getCountdown(deadlineAt: string): { label: string; isEnded: boolean } {
  const diff = new Date(deadlineAt).getTime() - Date.now()
  if (diff <= 0) return { label: 'Ended', isEnded: true }
  
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  
  if (days > 0) return { label: `${days}d ${hours}h ${minutes}m ${seconds}s`, isEnded: false }
  if (hours > 0) return { label: `${hours}h ${minutes}m ${seconds}s`, isEnded: false }
  if (minutes > 0) return { label: `${minutes}m ${seconds}s`, isEnded: false }
  return { label: `${seconds}s`, isEnded: false }
}

export default function TaskCard({ id, title, description, budgetLamports, taskType, paymentToken, customTokenMint, customTokenSymbol, customTokenDecimals, customTokenLogoUri, status, creatorWallet, creatorUsername, creatorProfilePic, bidCount, submissionCount, budgetRemainingLamports, heading, imageUrl, imageTransform, deadlineAt, createdAt, isCreator, onImageTransformSave }: TaskCardProps) {
  const timeAgo = getTimeAgo(new Date(createdAt))
  const [countdown, setCountdown] = useState<{ label: string; isEnded: boolean } | null>(null)
  const [editingPosition, setEditingPosition] = useState(false)
  const [pendingTransform, setPendingTransform] = useState<ImageTransform>(imageTransform || { scale: 1, x: 50, y: 50 })
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = `${window.location.origin}/tasks/${id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [id])
  
  const isCampaign = taskType === 'CAMPAIGN'
  const pt: PaymentTokenType = (paymentToken as PaymentTokenType) || 'SOL'
  const tInfo = resolveTokenInfo(pt, customTokenMint, customTokenSymbol, customTokenDecimals)
  const budgetAmountDisplay = formatTokenAmount(budgetLamports, tInfo, pt === 'SOL' ? 1 : 0)
  const budgetTotal = Number(budgetLamports)
  const budgetRemaining = budgetRemainingLamports ? Number(budgetRemainingLamports) : budgetTotal
  const budgetUsedPercent = budgetTotal > 0 ? Math.round(((budgetTotal - budgetRemaining) / budgetTotal) * 100) : 0
  const budgetExhausted = isCampaign && budgetRemaining <= 0
  const participantCount = submissionCount ?? bidCount

  useEffect(() => {
    if (!deadlineAt || budgetExhausted) return
    
    const update = () => setCountdown(getCountdown(deadlineAt))
    update()
    
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [deadlineAt, budgetExhausted])

  const hasCampaignImage = isCampaign && imageUrl

  const handleSavePosition = useCallback(() => {
    if (onImageTransformSave) {
      onImageTransformSave(id, pendingTransform)
    }
    setEditingPosition(false)
  }, [id, pendingTransform, onImageTransformSave])

  // Campaign card with full-bleed image
  if (hasCampaignImage) {
    // Show position editor mode
    if (editingPosition && imageUrl) {
      return (
        <div className="rounded-2xl overflow-hidden h-[552px] border border-accent/30">
          <ImagePositionEditor
            imageUrl={imageUrl}
            initialTransform={pendingTransform}
            onTransformChange={setPendingTransform}
            onSave={handleSavePosition}
            onCancel={() => { setPendingTransform(imageTransform || { scale: 1, x: 50, y: 50 }); setEditingPosition(false) }}
            height="h-[410px]"
          />
        </div>
      )
    }

    const imgStyle = getImageTransformStyle(imageTransform)

    return (
      <Link href={`/tasks/${id}`} className="block group">
        <div className="relative rounded-2xl overflow-hidden h-[552px] transition-all hover:shadow-xl hover:shadow-accent/10 hover:ring-1 hover:ring-accent/30">
          {/* Full-bleed image */}
          <img
            src={imageUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            style={imgStyle}
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent" style={{ top: '35%' }} />

          {/* Top-left: share button */}
          <div className="absolute top-3 left-3 z-20">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 rounded-lg bg-black/60 backdrop-blur-sm px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black/80 transition"
              title="Copy link"
            >
              {copied ? (
                <>
                  <svg className="h-3.5 w-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                  <span>Share</span>
                </>
              )}
            </button>
          </div>

          {/* Top-right: budget badge + reposition button */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            <span className="flex items-center gap-2 rounded-lg bg-black/60 backdrop-blur-sm px-3.5 py-2 text-lg font-bold text-accent">
              {budgetAmountDisplay}
              <TokenIcon token={pt} size={pt === 'USDC' ? 26 : 22} logoUri={customTokenLogoUri} />
              {pt === 'CUSTOM' && <span className="text-sm font-semibold">{tInfo.symbol}</span>}
            </span>
            {isCreator && onImageTransformSave && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingPosition(true) }}
                className="rounded-lg bg-black/60 px-2 py-1.5 text-xs font-medium text-white hover:bg-black/80 backdrop-blur-sm transition"
              >
                Reposition
              </button>
            )}
          </div>

          {/* Content on overlay */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col p-4 pt-0">
            <h3 className="text-lg font-bold text-white group-hover:text-accent transition-colors line-clamp-1 mb-1">
              {title}
            </h3>
            <p className="line-clamp-2 text-sm text-zinc-300/80 mb-3">{heading || description}</p>

            {budgetExhausted && (
              <div className="mb-3 text-xs font-semibold text-red-400">Budget Used</div>
            )}

            {/* Budget Progress Bar */}
            <div className="mb-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-zinc-400 font-medium">Budget Used</span>
                <span className="font-semibold text-zinc-300">{budgetUsedPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 backdrop-blur-sm">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${budgetUsedPercent}%` }}
                />
              </div>
            </div>

            {/* Footer meta */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {participantCount}
                </span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <Link
                  href={`/u/${creatorWallet}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 hover:text-zinc-200 transition-colors"
                >
                  {creatorProfilePic ? (
                    <img
                      src={creatorProfilePic}
                      alt=""
                      className="h-5 w-5 rounded-full object-cover ring-1 ring-white/20"
                    />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-zinc-300">
                      {creatorWallet.slice(0, 2)}
                    </div>
                  )}
                  <span className="text-xs" title={creatorWallet}>{creatorUsername || `${creatorWallet.slice(0, 4)}...${creatorWallet.slice(-4)}`}</span>
                </Link>
                {!budgetExhausted && countdown && (
                  <span className={`text-xs font-medium ${countdown.isEnded ? 'text-red-400' : 'text-zinc-300'}`}>
                    {countdown.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  // Default card (non-campaign or no image)
  return (
    <Link href={`/tasks/${id}`} className="block group">
      <div className="rounded-2xl border border-k-border bg-surface overflow-hidden transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
        <div className="p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-white group-hover:text-accent transition-colors line-clamp-1">{title}</h3>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || ''}`}>
              {status.replace('_', ' ')}
            </span>
          </div>
          
          <p className="mb-3 line-clamp-2 text-sm text-zinc-500">{isCampaign && heading ? heading : description}</p>

          {/* Budget info */}
          <div className="mb-3 flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-sm font-bold text-accent">
              {budgetAmountDisplay}
              <TokenIcon token={pt} size={pt === 'USDC' ? 20 : 16} logoUri={customTokenLogoUri} />
              {pt === 'CUSTOM' && <span className="text-xs font-semibold">{tInfo.symbol}</span>}
            </span>
          </div>
          
          {/* Budget Progress Bar for Campaigns */}
          {isCampaign && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500 font-medium">Budget Used</span>
                <span className="font-semibold text-zinc-400">{budgetUsedPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div 
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${budgetUsedPercent}%` }}
                />
              </div>
            </div>
          )}
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-zinc-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {participantCount}
              </span>
              {deadlineAt && !isCampaign && countdown && (
                <span className={`text-xs font-medium ${
                  countdown.isEnded ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {countdown.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-zinc-500">
              <Link
                href={`/u/${creatorWallet}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 hover:text-zinc-300"
              >
                {creatorProfilePic ? (
                  <img
                    src={creatorProfilePic}
                    alt=""
                    className="h-[22px] w-[22px] rounded-full object-cover ring-1 ring-k-border"
                  />
                ) : (
                  <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-zinc-800 text-[10px] font-medium text-zinc-400">
                    {creatorWallet.slice(0, 2)}
                  </div>
                )}
                <span className="text-xs" title={creatorWallet}>{creatorUsername || `${creatorWallet.slice(0, 4)}...${creatorWallet.slice(-4)}`}</span>
              </Link>
              <span className="text-xs">{timeAgo}</span>
            </div>
          </div>

          {/* View Details + Share */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex flex-1 items-center justify-center rounded-lg bg-accent py-2 text-sm font-semibold text-black transition group-hover:bg-accent-hover">
              View Details →
            </div>
            <button
              onClick={handleShare}
              className="flex items-center justify-center rounded-lg border border-k-border px-3 py-2 text-zinc-400 transition hover:border-accent/40 hover:text-accent"
              title="Copy link"
            >
              {copied ? (
                <svg className="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </Link>
  )
}

function getTimeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
