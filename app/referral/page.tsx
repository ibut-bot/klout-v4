'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

interface ReferralTier {
  tier: number
  usersInTier: number
  referrerFeePct: number
  platformFeePct: number
  cumulativeStart: number
  cumulativeEnd: number
}

interface ReferralStats {
  totalReferrals: number
  maxReferrals: number
  isActive: boolean
  currentTier: {
    tier: number
    referrerFeePct: number
    platformFeePct: number
    usersInTier: number
    usersFilledInTier: number
    remainingInTier: number
  } | null
  tiers: ReferralTier[]
}

interface ReferredUser {
  id: string
  wallet: string
  username: string | null
  xUsername: string | null
  profilePicUrl: string | null
  tierNumber: number
  referrerFeePct: number
  completed: boolean
  completedAt: string | null
  signedUpAt: string
  earnings: { totalEarned: string; paymentCount: number }
}

interface ReferralDashboard {
  code: string | null
  hasKloutScore: boolean
  canRefer: boolean
  totalReferred: number
  completedReferrals: number
  pendingReferrals: number
  totalEarned: string
  referredUsers: ReferredUser[]
  referredBy: {
    username: string | null
    xUsername: string | null
    wallet: string
    tierNumber: number
    referrerFeePct: number
    completed: boolean
  } | null
}

export default function ReferralPage() {
  const { authFetch, wallet } = useAuth()
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null)
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, statsRes] = await Promise.all([
        authFetch('/api/referral'),
        fetch('/api/referral/stats'),
      ])
      const [dashData, statsData] = await Promise.all([dashRes.json(), statsRes.json()])
      if (dashData.success) {
        setDashboard(dashData.referral)
        // Auto-generate referral code if user has a Klout score but no code yet
        if (dashData.referral.hasKloutScore && !dashData.referral.code) {
          try {
            const genRes = await authFetch('/api/referral/generate', { method: 'POST' })
            const genData = await genRes.json()
            if (genData.success) {
              setDashboard((prev: ReferralDashboard | null) => prev ? { ...prev, code: genData.code } : prev)
            }
          } catch {}
        }
      }
      if (statsData.success) setStats(statsData.stats)
    } catch {}
    setLoading(false)
  }, [authFetch])

  useEffect(() => {
    if (wallet) fetchData()
    else setLoading(false)
  }, [wallet, fetchData])

  const copyLink = () => {
    if (!dashboard?.code) return
    const link = `${window.location.origin}/${dashboard.code}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!wallet) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Referral Program</h1>
        <p className="text-zinc-400">Connect your wallet to access the referral program.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-zinc-800" />
          <div className="h-32 rounded-xl bg-zinc-800" />
          <div className="h-48 rounded-xl bg-zinc-800" />
        </div>
      </div>
    )
  }

  const totalEarnedSol = Number(dashboard?.totalEarned || 0) / LAMPORTS_PER_SOL

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Referral Program</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Refer users to Klout and earn a share of the platform fee whenever they get paid for tasks.
        </p>
      </div>

      {/* Referral Code Section */}
      <div className="rounded-xl border border-k-border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Your Referral Link</h2>
        {!dashboard?.hasKloutScore ? (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 mt-0.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-amber-300">Klout Score Required</p>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  You need a Klout score to participate in the referral program. Your score measures your X/Twitter influence and also <span className="text-zinc-200">unlocks access to exclusive, higher-paying campaigns</span>.
                </p>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Once you have your score, you&apos;ll get a personal referral link. When people you refer earn from campaigns, you&apos;ll automatically receive a share of the platform fee — every time they get paid.
                </p>
              </div>
            </div>
            <a
              href="/my-score"
              className="inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-black hover:bg-accent-hover transition-colors"
            >
              Get Your Klout Score
            </a>
          </div>
        ) : dashboard?.code ? (
          <div className="flex items-center gap-3 flex-wrap">
            <code className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-mono text-accent break-all">
              {window.location.origin}/{dashboard.code}
            </code>
            <button
              onClick={copyLink}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">Generating your referral link...</p>
        )}
      </div>

      {/* Program Progress */}
      {stats && (
        <div className="rounded-xl border border-k-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Program Progress</h2>
          
          {stats.currentTier ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <p className="text-xs text-zinc-500">Current Epoch</p>
                  <p className="text-lg font-semibold text-white">Tier {stats.currentTier.tier}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <p className="text-xs text-zinc-500">Your Referrer Fee</p>
                  <p className="text-lg font-semibold text-accent">{stats.currentTier.referrerFeePct}%</p>
                  <p className="text-xs text-zinc-500">of 10% platform fee</p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <p className="text-xs text-zinc-500">Remaining in Tier</p>
                  <p className="text-lg font-semibold text-white">{stats.currentTier.remainingInTier.toLocaleString()}</p>
                </div>
              </div>

              {/* Tier Progress Bar with next-tier preview */}
              {(() => {
                const pct = (stats.currentTier!.usersFilledInTier / stats.currentTier!.usersInTier) * 100
                const nextTier = stats.tiers.find(t => t.tier === stats.currentTier!.tier + 1)
                return (
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-zinc-500">
                      <span>Tier {stats.currentTier!.tier} — {stats.currentTier!.referrerFeePct}% referrer fee</span>
                      <span>{stats.currentTier!.remainingInTier.toLocaleString()} slots left</span>
                    </div>
                    <div className="relative h-4 w-full overflow-hidden rounded-full bg-zinc-700">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {nextTier && (
                      <div className="mt-1.5 flex items-center justify-between text-xs">
                        <span className="text-zinc-500">
                          Next: <span className="text-zinc-300 font-medium">Tier {nextTier.tier}</span> — referrer fee drops to <span className="text-amber-400 font-medium">{nextTier.referrerFeePct}%</span>
                        </span>
                        <span className="text-zinc-600">{nextTier.usersInTier.toLocaleString()} slots</span>
                      </div>
                    )}
                    {!nextTier && (
                      <p className="mt-1.5 text-xs text-zinc-500">This is the final tier of the referral program.</p>
                    )}
                  </div>
                )
              })()}
            </>
          ) : (
            <p className="text-sm text-zinc-400">
              The referral program has ended. All {stats.maxReferrals.toLocaleString()} referral slots have been filled.
              Existing referrers continue to earn from their referred users.
            </p>
          )}

          {/* Tier Schedule */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-300">
              View all tiers
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-k-border">
                    <th className="pb-2 pr-4 font-medium text-zinc-500">Tier</th>
                    <th className="pb-2 pr-4 font-medium text-zinc-500">Users</th>
                    <th className="pb-2 pr-4 font-medium text-zinc-500">Referrer</th>
                    <th className="pb-2 pr-4 font-medium text-zinc-500">Platform</th>
                    <th className="pb-2 font-medium text-zinc-500">Range</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.tiers.map(t => {
                    const isCurrent = stats.currentTier?.tier === t.tier
                    return (
                      <tr key={t.tier} className={`border-b border-k-border/50 ${isCurrent ? 'bg-accent/5' : ''}`}>
                        <td className="py-2 pr-4 text-zinc-300">
                          {t.tier} {isCurrent && <span className="text-accent text-xs">(current)</span>}
                        </td>
                        <td className="py-2 pr-4 text-zinc-300">{t.usersInTier.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-accent">{t.referrerFeePct}%</td>
                        <td className="py-2 pr-4 text-zinc-400">{t.platformFeePct}%</td>
                        <td className="py-2 text-zinc-400 text-xs">{t.cumulativeStart.toLocaleString()} - {t.cumulativeEnd.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {/* Your Stats */}
      {dashboard && (
        <div className="rounded-xl border border-k-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Your Referral Stats</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-500">Total Referred</p>
              <p className="text-lg font-semibold text-white">{dashboard.totalReferred}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-500">Completed</p>
              <p className="text-lg font-semibold text-green-400">{dashboard.completedReferrals}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-500">Pending Score</p>
              <p className="text-lg font-semibold text-amber-400">{dashboard.pendingReferrals}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-500">Total Earned</p>
              <p className="text-lg font-semibold text-accent">
                {totalEarnedSol > 0 ? totalEarnedSol.toFixed(4) : '0'} SOL
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Referred Users Table */}
      {dashboard && dashboard.referredUsers.length > 0 && (
        <div className="rounded-xl border border-k-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Referred Users</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-k-border">
                  <th className="pb-2 pr-4 font-medium text-zinc-500">User</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Status</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Tier</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Your Fee</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Earned</th>
                  <th className="pb-2 font-medium text-zinc-500">Payments</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.referredUsers.map(u => (
                  <tr key={u.id} className="border-b border-k-border/50">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {u.profilePicUrl ? (
                          <img src={u.profilePicUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-medium text-zinc-300">
                            {u.wallet.slice(0, 2)}
                          </div>
                        )}
                        <span className="text-zinc-300">
                          {u.xUsername ? `@${u.xUsername}` : u.username || `${u.wallet.slice(0, 6)}...`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      {u.completed ? (
                        <span className="inline-block rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">Active</span>
                      ) : (
                        <span className="inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">Pending Score</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">{u.tierNumber}</td>
                    <td className="py-3 pr-4 text-accent">{u.referrerFeePct}%</td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {Number(u.earnings.totalEarned) > 0
                        ? (Number(u.earnings.totalEarned) / LAMPORTS_PER_SOL).toFixed(4)
                        : '0'} SOL
                    </td>
                    <td className="py-3 text-zinc-400">{u.earnings.paymentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Referred By */}
      {dashboard?.referredBy && (
        <div className="rounded-xl border border-k-border p-4">
          <p className="text-sm text-zinc-400">
            You were referred by{' '}
            <span className="text-zinc-200">
              {dashboard.referredBy.xUsername ? `@${dashboard.referredBy.xUsername}` : dashboard.referredBy.username || `${dashboard.referredBy.wallet.slice(0, 8)}...`}
            </span>
            {!dashboard.referredBy.completed && (
              <span className="text-amber-400"> — Complete your Klout score to activate the referral.</span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
