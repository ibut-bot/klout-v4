'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useAuth } from '../hooks/useAuth'

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false }
)

export default function Navbar() {
  const { isAuthenticated, connected, loading } = useAuth()

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            slopwork
          </Link>
          <div className="hidden items-center gap-6 sm:flex">
            <Link href="/tasks" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Browse Tasks
            </Link>
            <Link href="/skills" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Skills
            </Link>
            {isAuthenticated && (
              <>
                <Link href="/tasks/new" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                  Post Task
                </Link>
                <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                  Dashboard
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {connected && loading && (
            <span className="text-sm text-zinc-500">Signing in...</span>
          )}
          <WalletMultiButton />
        </div>
      </div>
    </nav>
  )
}
