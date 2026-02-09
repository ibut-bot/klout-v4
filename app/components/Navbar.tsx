'use client'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false }
)

export default function Navbar() {
  const { isAuthenticated, connected, loading, wallet, authFetch } = useAuth()
  const [profilePic, setProfilePic] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch profile pic when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      authFetch('/api/profile/avatar')
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setProfilePic(data.profilePicUrl)
        })
        .catch(() => {})
    } else {
      setProfilePic(null)
    }
  }, [isAuthenticated, authFetch])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await authFetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        setProfilePic(data.url)
      }
    } catch (err) {
      console.error('Failed to upload avatar:', err)
    } finally {
      setUploading(false)
      setShowDropdown(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveAvatar = async () => {
    try {
      const res = await authFetch('/api/profile/avatar', {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        setProfilePic(null)
      }
    } catch (err) {
      console.error('Failed to remove avatar:', err)
    } finally {
      setShowDropdown(false)
    }
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center">
            <Image src="/slop favicon.svg" alt="Slopwork" width={40} height={40} />
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/tasks" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Tasks
            </Link>
            {isAuthenticated && (
              <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                Dashboard
              </Link>
            )}
            {isAuthenticated && (
              <Link href="/admin/disputes" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                Disputes
              </Link>
            )}
            <Link href="/skills" className="hidden sm:block text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
              Skills
            </Link>
            {isAuthenticated && (
              <Link href="/tasks/new" className="hidden sm:block text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
                Post Task
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {connected && loading && (
            <span className="text-sm text-zinc-500">Signing in...</span>
          )}
          {isAuthenticated && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                {profilePic ? (
                  <img src={profilePic} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {wallet?.slice(0, 2)}
                  </div>
                )}
              </button>
              {showDropdown && (
                <div className="absolute right-0 top-11 z-50 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <Link
                    href={`/u/${wallet}`}
                    onClick={() => setShowDropdown(false)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    My Profile
                  </Link>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {uploading ? 'Uploading...' : profilePic ? 'Change Profile Pic' : 'Upload Profile Pic'}
                  </button>
                  {profilePic && (
                    <button
                      onClick={handleRemoveAvatar}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-zinc-50 dark:text-red-400 dark:hover:bg-zinc-800"
                    >
                      Remove Profile Pic
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <WalletMultiButton />
        </div>
      </div>
    </nav>
  )
}
