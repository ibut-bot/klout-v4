'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import ImagePositionEditor, { getImageTransformStyle, type ImageTransform } from './ImagePositionEditor'
import { type PaymentTokenType, formatTokenAmount, tokenSymbol } from '@/lib/token-utils'

interface TaskCardProps {
  id: string
  title: string
  description: string
  budgetLamports: string
  taskType?: string
  paymentToken?: string
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

export default function TaskCard({ id, title, description, budgetLamports, taskType, paymentToken, status, creatorWallet, creatorUsername, creatorProfilePic, bidCount, submissionCount, budgetRemainingLamports, heading, imageUrl, imageTransform, deadlineAt, createdAt, isCreator, onImageTransformSave }: TaskCardProps) {
  const timeAgo = getTimeAgo(new Date(createdAt))
  const [countdown, setCountdown] = useState<{ label: string; isEnded: boolean } | null>(null)
  const [editingPosition, setEditingPosition] = useState(false)
  const [pendingTransform, setPendingTransform] = useState<ImageTransform>(imageTransform || { scale: 1, x: 50, y: 50 })
  
  const isCampaign = taskType === 'CAMPAIGN'
  const pt: PaymentTokenType = (paymentToken as PaymentTokenType) || 'SOL'
  const budgetDisplay = `${formatTokenAmount(budgetLamports, pt, 2)} ${tokenSymbol(pt)}`
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

          {/* Reposition button for creators */}
          {isCreator && onImageTransformSave && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingPosition(true) }}
              className="absolute top-2 right-2 z-20 rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white hover:bg-black/80 backdrop-blur-sm transition"
            >
              Reposition
            </button>
          )}

          {/* Content on overlay */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col p-4 pt-0">
            <h3 className="text-lg font-bold text-white group-hover:text-accent transition-colors line-clamp-1 mb-1">
              {title}
            </h3>
            <p className="line-clamp-2 text-sm text-zinc-300/80 mb-3">{heading || description}</p>

            {/* Tags row */}
            <div className="mb-3 flex items-center gap-3 text-xs font-semibold">
              <span className="text-accent">
                {budgetDisplay}
              </span>
              {budgetExhausted && (
                <span className="text-red-400">
                  Budget Used
                </span>
              )}
            </div>

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
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
              {budgetDisplay}
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

          {/* View Details Button */}
          <div className="mt-3 flex items-center justify-center rounded-lg bg-accent py-2 text-sm font-semibold text-black transition group-hover:bg-accent-hover">
            View Details →
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
