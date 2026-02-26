'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './useAuth'

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  linkUrl: string
  read: boolean
  createdAt: string
}

const POLL_INTERVAL = 30_000

export function useNotifications() {
  const { isAuthenticated, authFetch } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await authFetch('/api/me/notifications?limit=20')
      const data = await res.json()
      if (data.success) {
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      }
    } catch {
      // Silently fail — will retry on next poll
    }
  }, [isAuthenticated, authFetch])

  // Poll for notifications
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([])
      setUnreadCount(0)
      return
    }

    fetchNotifications()
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isAuthenticated, fetchNotifications])

  const markAsRead = useCallback(
    async (ids: string[]) => {
      try {
        await authFetch('/api/me/notifications', {
          method: 'PATCH',
          body: JSON.stringify({ ids }),
        })
        setNotifications((prev) =>
          prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - ids.length))
      } catch {}
    },
    [authFetch]
  )

  const markAllRead = useCallback(async () => {
    try {
      await authFetch('/api/me/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ markAllRead: true }),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {}
  }, [authFetch])

  return { notifications, unreadCount, markAsRead, markAllRead, refetch: fetchNotifications }
}
