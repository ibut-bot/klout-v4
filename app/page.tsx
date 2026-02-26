'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/tasks')
  }, [router])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-3xl font-bold text-zinc-100 mb-4">Klout</h1>
      <p className="text-zinc-400 mb-6">Monetize your Klout. Redirecting...</p>
      <div className="flex gap-4 text-sm text-zinc-500">
        <Link href="/tasks" className="text-accent hover:text-accent-hover">Campaigns</Link>
        <Link href="/privacy" className="hover:text-zinc-300">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-zinc-300">Terms of Service</Link>
      </div>
    </div>
  )
}
