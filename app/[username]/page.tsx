'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

/**
 * Referral landing page: klout.gg/johndoe
 * Stores the X username as the referral code and redirects to the homepage.
 */
export default function ReferralLandingPage() {
  const { username } = useParams<{ username: string }>()
  const router = useRouter()

  useEffect(() => {
    if (username && username.length >= 2) {
      localStorage.setItem('klout_referral_code', username.toLowerCase())
    }
    router.replace('/')
  }, [username, router])

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-sm text-zinc-400">Redirecting...</p>
    </div>
  )
}
