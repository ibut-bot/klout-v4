'use client'

import { useCallback, useEffect, useState } from 'react'

interface KloutUser {
  id: string
  name: string | null
  username: string | null
  image: string | null
  twitterId: string | null
  score: number
  rank: number
}

interface Pagination {
  page: number
  pageSize: number
  nextPage: number | null
  hasMore: boolean
  total: number
}

const PAGE_SIZE = 50

const formatNumber = (num: number): string => {
  if (num < 100000) return new Intl.NumberFormat('en').format(num)
  return new Intl.NumberFormat('en', { notation: 'compact', compactDisplay: 'short' }).format(num)
}

function FallbackAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-sm font-semibold text-muted">
      {initials || '??'}
    </div>
  )
}

function ScoreRow({ user }: { user: KloutUser }) {
  const [imgError, setImgError] = useState(false)
  const displayName = user.name || user.username || 'Anonymous'

  return (
    <div className="flex items-center gap-3 border-b border-k-border px-4 py-3 last:border-b-0 transition-colors hover:bg-surface-hover">
      {/* Rank */}
      <span className="w-10 shrink-0 text-center text-sm font-semibold text-zinc-500">
        {user.rank}
      </span>

      {/* Avatar */}
      {user.image && !imgError ? (
        <img
          src={user.image.replace('normal', '400x400')}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg bg-surface-hover object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <FallbackAvatar name={displayName} />
      )}

      {/* Name */}
      <div className="min-w-0 flex-1">
        {user.username ? (
          <a
            href={`https://x.com/${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-medium text-white hover:text-accent transition-colors"
          >
            {displayName}
          </a>
        ) : (
          <span className="block truncate font-medium text-white">{displayName}</span>
        )}
      </div>

      {/* Score */}
      <span className="shrink-0 text-lg font-semibold text-accent">
        {formatNumber(user.score)}
      </span>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 border-b border-k-border px-4 py-3 last:border-b-0">
      <div className="h-4 w-10 shrink-0 animate-pulse rounded bg-surface-hover" />
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface-hover" />
      <div className="flex-1">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-hover" />
      </div>
      <div className="h-5 w-16 shrink-0 animate-pulse rounded bg-surface-hover" />
    </div>
  )
}

export default function KloutScoresPage() {
  const [users, setUsers] = useState<KloutUser[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async (page: number, append: boolean) => {
    try {
      const res = await fetch(`/api/klout-scores?page=${page}&pageSize=${PAGE_SIZE}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load')
      setUsers((prev) => (append ? [...prev, ...data.users] : data.users))
      setPagination(data.pagination)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchPage(1, false).finally(() => setLoading(false))
  }, [fetchPage])

  const handleLoadMore = async () => {
    if (!pagination?.hasMore || loadingMore) return
    setLoadingMore(true)
    await fetchPage(pagination.nextPage!, true)
    setLoadingMore(false)
  }

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-white">
          Klout <span className="text-accent">Scores</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          {pagination ? `${formatNumber(pagination.total)} users ranked` : 'Loading...'}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-k-border bg-surface">
        {loading ? (
          Array.from({ length: 10 }, (_, i) => <SkeletonRow key={i} />)
        ) : error ? (
          <div className="p-8 text-center text-red-400">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No scores yet.</div>
        ) : (
          users.map((user) => <ScoreRow key={user.id} user={user} />)
        )}
      </div>

      {pagination?.hasMore && !loading && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-6 w-full rounded-xl bg-surface py-3 text-sm font-semibold text-accent border border-k-border transition-colors hover:bg-surface-hover hover:border-k-border-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  )
}
