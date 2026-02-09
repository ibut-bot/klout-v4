'use client'

import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import Link from 'next/link'

function formatSol(lamports: string | number): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0 SOL'
  if (sol < 0.01) return `${sol.toPrecision(2)} SOL`
  return `${sol.toFixed(2)} SOL`
}

interface Attachment {
  url: string
  key?: string
  contentType?: string
  size?: number
  filename?: string
}

interface SubmissionBid {
  id: string
  bidderId: string
  amountLamports: string
  multisigAddress: string | null
  vaultAddress: string | null
  proposalIndex: number | null
  status: string
  bidderWallet: string
  bidderUsername?: string | null
  bidderProfilePic?: string | null
}

interface Submission {
  id: string
  bidId: string
  description: string
  attachments: Attachment[] | null
  createdAt: string
  bid?: SubmissionBid
}

interface SubmissionListProps {
  submissions: Submission[]
  isCreator: boolean
  taskType: string
  taskStatus: string
  onSelectWinner?: (bidId: string) => void
  selectingBidId?: string | null
}

export default function SubmissionList({
  submissions,
  isCreator,
  taskType,
  taskStatus,
  onSelectWinner,
  selectingBidId,
}: SubmissionListProps) {
  const isCompetition = taskType === 'COMPETITION'

  if (submissions.length === 0) {
    return <p className="text-sm text-zinc-500">No submissions yet.</p>
  }

  const isImage = (ct?: string) => ct?.startsWith('image/')
  const isVideo = (ct?: string) => ct?.startsWith('video/')

  return (
    <div className="space-y-4">
      {submissions.map((sub) => (
        <div
          key={sub.id}
          className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
        >
          {/* Bidder info */}
          {sub.bid && (
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link href={`/u/${sub.bid.bidderWallet}`} className="flex items-center gap-1.5 hover:opacity-80">
                  {sub.bid.bidderProfilePic ? (
                    <img src={sub.bid.bidderProfilePic} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      {sub.bid.bidderWallet.slice(0, 2)}
                    </div>
                  )}
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {sub.bid.bidderUsername || `${sub.bid.bidderWallet.slice(0, 4)}...${sub.bid.bidderWallet.slice(-4)}`}
                  </span>
                </Link>
                <span className="text-sm text-zinc-500">{formatSol(sub.bid.amountLamports)}</span>
              </div>
              <span className="text-xs text-zinc-400">
                {new Date(sub.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Description */}
          <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
            {sub.description}
          </p>

          {/* Attachments */}
          {sub.attachments && sub.attachments.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium text-zinc-500">Attachments ({sub.attachments.length})</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {sub.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
                  >
                    {isImage(att.contentType) ? (
                      <img src={att.url} alt={att.filename || ''} className="h-32 w-full object-cover" />
                    ) : isVideo(att.contentType) ? (
                      <video src={att.url} className="h-32 w-full object-cover" />
                    ) : (
                      <div className="flex h-32 items-center justify-center bg-zinc-50 dark:bg-zinc-900">
                        <span className="text-xs text-zinc-500">{att.filename || 'File'}</span>
                      </div>
                    )}
                    <div className="px-2 py-1.5">
                      <p className="truncate text-xs text-zinc-600 group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-200">
                        {att.filename || 'Download'}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Select winner button (competition mode, creator only) */}
          {isCompetition && isCreator && taskStatus === 'OPEN' && sub.bid && sub.bid.status === 'PENDING' && onSelectWinner && (
            <button
              onClick={() => onSelectWinner(sub.bid!.id)}
              disabled={selectingBidId === sub.bid.id}
              className="mt-2 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {selectingBidId === sub.bid.id ? 'Selecting...' : `Select Winner (${formatSol(sub.bid.amountLamports)})`}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
