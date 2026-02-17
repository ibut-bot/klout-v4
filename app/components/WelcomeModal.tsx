'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import Link from 'next/link'

export default function WelcomeModal() {
  const { isAuthenticated, authFetch } = useAuth()
  const [show, setShow] = useState(false)
  const [referrer, setReferrer] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return

    authFetch('/api/me/welcome')
      .then(r => r.json())
      .then(data => {
        if (data.success && !data.welcomeShown) {
          setShow(true)
          const code = localStorage.getItem('klout_referral_code')
          if (code) setReferrer(code)
        }
      })
      .catch(() => {})
  }, [isAuthenticated, authFetch])

  const dismiss = useCallback(() => {
    setShow(false)
    authFetch('/api/me/welcome', { method: 'POST' }).catch(() => {})
  }, [authFetch])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-k-border bg-zinc-900 p-6 sm:p-8 shadow-2xl space-y-6 overflow-y-auto max-h-[90vh]">
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Heading */}
        <div className="text-center space-y-2">
          {referrer && (
            <p className="text-sm text-accent font-medium">
              You were invited by @{referrer}
            </p>
          )}
          <h2 className="text-2xl font-bold text-white">Welcome to Klout</h2>
          <p className="text-sm text-zinc-400">
            Get paid in crypto for promoting brands on X/Twitter. Campaigns pay you automatically based on your post views.
          </p>
        </div>

        {/* Klout Score */}
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <svg className="h-4 w-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Get Your Klout Score
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Your Klout score measures your X/Twitter influence. It&apos;s <span className="text-zinc-200 font-medium">required to participate in campaigns</span> and submit posts for payment. A higher score also unlocks access to <span className="text-zinc-200 font-medium">exclusive, higher-paying campaigns</span> and lets you earn more per post.
          </p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            To get your score, you&apos;ll need to <span className="text-accent font-medium">follow @kloutgg on X</span> first.
          </p>
          {referrer && (
            <p className="text-xs text-accent/80">
              Getting your score also activates your referral — so @{referrer} can start earning from your work.
            </p>
          )}
        </div>

        {/* Referral Program */}
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Refer Friends, Earn Fees
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Once you have a Klout score, you get a <span className="text-zinc-200 font-medium">personal referral link</span>. When people you refer earn from campaigns, you earn a share of the platform fee — automatically, every time they get paid.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3 pt-2">
          <Link
            href="/my-score"
            onClick={dismiss}
            className="w-full rounded-xl bg-accent py-3 text-center text-sm font-bold text-black hover:bg-accent-hover transition-colors"
          >
            Get Your Klout Score
          </Link>
          <button
            onClick={dismiss}
            className="w-full rounded-xl border border-zinc-700 py-3 text-center text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            Explore Campaigns First
          </button>
        </div>
      </div>
    </div>
  )
}
