'use client'

import Link from 'next/link'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(2)} SOL`
}

interface TaskCardProps {
  id: string
  title: string
  description: string
  budgetLamports: string
  taskType?: string
  status: string
  creatorWallet: string
  creatorUsername?: string | null
  creatorProfilePic?: string | null
  bidCount: number
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  COMPLETED: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  DISPUTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
}

const TYPE_COLORS: Record<string, string> = {
  QUOTE: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  COMPETITION: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

export default function TaskCard({ id, title, description, budgetLamports, taskType, status, creatorWallet, creatorUsername, creatorProfilePic, bidCount, createdAt }: TaskCardProps) {
  const timeAgo = getTimeAgo(new Date(createdAt))

  return (
    <Link href={`/tasks/${id}`} className="block">
      <div className="rounded-xl border border-zinc-200 p-5 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-700">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
          <div className="flex items-center gap-1.5">
            {taskType && (
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[taskType] || ''}`}>
                {taskType === 'COMPETITION' ? 'Competition' : 'Quote'}
              </span>
            )}
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || ''}`}>
              {status.replace('_', ' ')}
            </span>
          </div>
        </div>
        <p className="mb-4 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatSol(budgetLamports)}</span>
            <span className="text-zinc-500">{bidCount} bid{bidCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Link
              href={`/u/${creatorWallet}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              {creatorProfilePic ? (
                <img
                  src={creatorProfilePic}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                  {creatorWallet.slice(0, 2)}
                </div>
              )}
              <span title={creatorWallet}>{creatorUsername || `${creatorWallet.slice(0, 4)}...${creatorWallet.slice(-4)}`}</span>
            </Link>
            <span>{timeAgo}</span>
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
