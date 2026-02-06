'use client'

import Link from 'next/link'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

interface TaskCardProps {
  id: string
  title: string
  description: string
  budgetLamports: string
  status: string
  creatorWallet: string
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

export default function TaskCard({ id, title, description, budgetLamports, status, creatorWallet, bidCount, createdAt }: TaskCardProps) {
  const budgetSol = Number(budgetLamports) / LAMPORTS_PER_SOL
  const timeAgo = getTimeAgo(new Date(createdAt))

  return (
    <Link href={`/tasks/${id}`} className="block">
      <div className="rounded-xl border border-zinc-200 p-5 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-700">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || ''}`}>
            {status.replace('_', ' ')}
          </span>
        </div>
        <p className="mb-4 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{budgetSol.toFixed(2)} SOL</span>
            <span className="text-zinc-500">{bidCount} bid{bidCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <span title={creatorWallet}>{creatorWallet.slice(0, 4)}...{creatorWallet.slice(-4)}</span>
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
