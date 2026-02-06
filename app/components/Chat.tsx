'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'

interface Message {
  id: string
  senderWallet: string
  content: string
  createdAt: string
}

interface ChatProps {
  taskId: string
}

export default function Chat({ taskId }: ChatProps) {
  const { authFetch, isAuthenticated, wallet } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchMessages = async () => {
    if (!isAuthenticated) return
    try {
      const since = messages.length > 0 ? messages[messages.length - 1].createdAt : ''
      const url = since
        ? `/api/tasks/${taskId}/messages?since=${encodeURIComponent(since)}`
        : `/api/tasks/${taskId}/messages`
      const res = await authFetch(url)
      const data = await res.json()
      if (data.success) {
        if (since && data.messages.length > 0) {
          setMessages((prev) => [...prev, ...data.messages])
        } else if (!since) {
          setMessages(data.messages)
        }
      }
    } catch {
      // silent retry
    }
  }

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 5000)
    return () => clearInterval(interval)
  }, [isAuthenticated, taskId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sending) return
    setError('')
    setSending(true)

    try {
      const res = await authFetch(`/api/tasks/${taskId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: input.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      setMessages((prev) => [...prev, data.message])
      setInput('')
    } catch (e: any) {
      setError(e.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (!isAuthenticated) {
    return <p className="text-sm text-zinc-500">Sign in to view messages.</p>
  }

  return (
    <div className="flex h-96 flex-col rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Messages</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-zinc-400">No messages yet.</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderWallet === wallet
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                isMe
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
              }`}>
                {!isMe && (
                  <p className="mb-0.5 text-xs font-medium opacity-60">
                    {msg.senderWallet.slice(0, 4)}...{msg.senderWallet.slice(-4)}
                  </p>
                )}
                <p>{msg.content}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="px-4 py-1 text-xs text-red-600">{error}</div>
      )}

      <form onSubmit={handleSend} className="flex border-t border-zinc-200 p-3 dark:border-zinc-800">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="ml-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      </form>
    </div>
  )
}
