'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Captures ?ref=CODE from the URL and stores it in localStorage.
 * Rendered once in the root layout so it works from any page.
 */
export default function ReferralCapture() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref && ref.length >= 2) {
      localStorage.setItem('klout_referral_code', ref.toLowerCase())
    }
  }, [searchParams])

  return null
}
