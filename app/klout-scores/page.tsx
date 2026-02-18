'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function KloutScoresPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/my-score?tab=scores')
  }, [router])
  return null
}
