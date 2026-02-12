'use client'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { useNotifications, type Notification } from '../hooks/useNotifications'

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false }
)

function timeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const NOTIF_ICONS: Record<string, string> = {
  NEW_BID: '💰',
  BID_ACCEPTED: '✅',
  BID_REJECTED: '❌',
  ESCROW_FUNDED: '🔒',
  PAYMENT_REQUESTED: '📝',
  PAYMENT_APPROVED: '💸',
  NEW_MESSAGE: '💬',
  DISPUTE_RAISED: '⚠️',
  DISPUTE_RESOLVED: '⚖️',
  CAMPAIGN_SUBMISSION_APPROVED: '📢',
  CAMPAIGN_SUBMISSION_REJECTED: '🚫',
  CAMPAIGN_PAYMENT_REQUEST: '📋',
  CAMPAIGN_PAYMENT_COMPLETED: '💸',
}

export default function Navbar() {
  const { isAuthenticated, connected, loading, wallet, authFetch } = useAuth()
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications()
  const router = useRouter()
  const [profilePic, setProfilePic] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [savingUsername, setSavingUsername] = useState(false)
  const [xUsername, setXUsername] = useState<string | null>(null)
  const [linkingX, setLinkingX] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  // Fetch profile info when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      authFetch('/api/profile/avatar')
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setProfilePic(data.profilePicUrl)
            setUsername(data.username)
          }
        })
        .catch(() => {})
      authFetch('/api/auth/x/status')
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.linked) setXUsername(data.xUsername)
        })
        .catch(() => {})
    } else {
      setProfilePic(null)
      setUsername(null)
      setXUsername(null)
    }
  }, [isAuthenticated, authFetch])

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) markAsRead([n.id])
    setShowNotifications(false)
    router.push(n.linkUrl)
  }

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

  const handleEditUsername = () => {
    setUsernameInput(username || '')
    setUsernameError(null)
    setEditingUsername(true)
  }

  const handleSaveUsername = async () => {
    const trimmed = usernameInput.trim()
    if (!trimmed) {
      setUsernameError('Username is required')
      return
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) {
      setUsernameError('3-20 chars, letters, numbers, underscores only')
      return
    }

    setSavingUsername(true)
    setUsernameError(null)

    try {
      const res = await authFetch('/api/profile/username', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      })
      const data = await res.json()
      if (data.success) {
        setUsername(data.username)
        setEditingUsername(false)
      } else {
        setUsernameError(data.message || 'Failed to save username')
      }
    } catch (err) {
      setUsernameError('Failed to save username')
    } finally {
      setSavingUsername(false)
    }
  }

  const handleCancelUsername = () => {
    setEditingUsername(false)
    setUsernameError(null)
  }

  const handleLinkX = async () => {
    setLinkingX(true)
    try {
      const res = await authFetch('/api/auth/x/authorize')
      const data = await res.json()
      if (data.success && data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch {
      setLinkingX(false)
    }
  }

  const handleUnlinkX = async () => {
    try {
      const res = await authFetch('/api/auth/x/unlink', { method: 'DELETE' })
      const data = await res.json()
      if (data.success) setXUsername(null)
    } catch {}
    setShowDropdown(false)
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-k-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center">
            <Image src="/Klout1.svg" alt="Klout" width={40} height={40} />
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/tasks" className="text-sm text-zinc-400 transition hover:text-accent">
              Campaigns
            </Link>
            {isAuthenticated && (
              <Link href="/dashboard" className="text-sm text-zinc-400 transition hover:text-accent">
                Dashboard
              </Link>
            )}
            {isAuthenticated && (
              <Link href="/admin/disputes" className="text-sm text-zinc-400 transition hover:text-accent">
                Disputes
              </Link>
            )}
            <Link href="/skills" className="hidden sm:block text-sm text-zinc-400 transition hover:text-accent">
              Skills
            </Link>
            {isAuthenticated && (
              <Link href="/tasks/new" className="hidden sm:block text-sm text-zinc-400 transition hover:text-accent">
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
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => { setShowNotifications(!showNotifications); setShowDropdown(false) }}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-k-border bg-surface transition hover:border-k-border-hover"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-black">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-k-border bg-surface shadow-2xl">
                  <div className="flex items-center justify-between border-b border-k-border px-4 py-2.5">
                    <span className="text-sm font-semibold text-zinc-100">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-accent hover:text-accent-hover"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-zinc-500">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-hover ${
                            !n.read ? 'bg-accent/5' : ''
                          }`}
                        >
                          <span className="mt-0.5 text-base leading-none">{NOTIF_ICONS[n.type] || '🔔'}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm ${!n.read ? 'font-semibold text-zinc-100' : 'font-medium text-zinc-300'}`}>
                                {n.title}
                              </span>
                              {!n.read && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-zinc-500">{n.body}</p>
                            <p className="mt-1 text-[10px] text-zinc-600">{timeAgo(n.createdAt)}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {isAuthenticated && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => { setShowDropdown(!showDropdown); setShowNotifications(false) }}
                className="flex h-[40px] w-[40px] items-center justify-center rounded-full border border-k-border bg-surface transition hover:border-accent/50"
              >
                {profilePic ? (
                  <img src={profilePic} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-surface text-xs font-medium text-zinc-400">
                    {wallet?.slice(0, 2)}
                  </div>
                )}
              </button>
              {showDropdown && (
                <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-k-border bg-surface py-1 shadow-2xl">
                  {/* Display current username or wallet */}
                  <div className="px-4 py-2 border-b border-k-border">
                    <p className="text-xs text-zinc-500">Signed in as</p>
                    <p className="text-sm font-medium text-zinc-100 truncate">
                      {username || `${wallet?.slice(0, 6)}...${wallet?.slice(-4)}`}
                    </p>
                  </div>

                  {/* Username editing */}
                  {editingUsername ? (
                    <div className="px-4 py-2 border-b border-k-border">
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        placeholder="Enter username"
                        className="w-full px-2 py-1 text-sm border border-k-border rounded bg-background text-zinc-100"
                        autoFocus
                      />
                      {usernameError && (
                        <p className="text-xs text-red-500 mt-1">{usernameError}</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleSaveUsername}
                          disabled={savingUsername}
                          className="flex-1 px-2 py-1 text-xs font-medium text-black bg-accent rounded hover:bg-accent-hover"
                        >
                          {savingUsername ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelUsername}
                          className="flex-1 px-2 py-1 text-xs font-medium text-zinc-400 border border-k-border rounded hover:bg-surface-hover"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleEditUsername}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-300 hover:bg-surface-hover"
                    >
                      {username ? 'Change Username' : 'Set Username'}
                    </button>
                  )}

                  {/* X Account linking */}
                  {xUsername ? (
                    <div className="flex items-center justify-between px-4 py-2 border-b border-k-border">
                      <span className="text-sm text-zinc-300">@{xUsername}</span>
                      <button
                        onClick={handleUnlinkX}
                        className="text-xs text-red-500 hover:text-red-400"
                      >
                        Unlink
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleLinkX}
                      disabled={linkingX}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-300 hover:bg-surface-hover"
                    >
                      {linkingX ? 'Redirecting...' : 'Link X Account'}
                    </button>
                  )}

                  <Link
                    href={`/u/${wallet}`}
                    onClick={() => setShowDropdown(false)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-300 hover:bg-surface-hover"
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
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-300 hover:bg-surface-hover"
                  >
                    {uploading ? 'Uploading...' : profilePic ? 'Change Profile Pic' : 'Upload Profile Pic'}
                  </button>
                  {profilePic && (
                    <button
                      onClick={handleRemoveAvatar}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-400 hover:bg-surface-hover"
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
