'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '../hooks/useAuth'

interface Attachment {
  url: string
  key?: string
  contentType: string
  size?: number
  filename?: string
}

/** Rewrite external object-storage URLs through /storage proxy */
function proxyUrl(url: string): string {
  const endpoint = process.env.NEXT_PUBLIC_HETZNER_ENDPOINT_URL || 'https://hel1.your-objectstorage.com'
  const bucket = process.env.NEXT_PUBLIC_HETZNER_BUCKET_NAME || 'openclaw83'
  const prefix = `${endpoint}/${bucket}/`
  if (url.startsWith(prefix)) {
    return '/storage/' + url.slice(prefix.length)
  }
  return url
}

interface Message {
  id: string
  senderWallet: string
  senderUsername?: string | null
  senderProfilePic?: string | null
  content: string
  attachments?: Attachment[]
  createdAt: string
}

interface Conversation {
  bidderId: string
  bidderWallet: string
  bidderUsername?: string | null
  bidderProfilePic?: string | null
  messageCount: number
  lastMessageAt: string | null
}

interface ChatProps {
  taskId: string
  isCreator: boolean
  // For bidders, this is not needed (they always talk to creator)
  // For creators, this is the list of bidders they can message
  bidders?: { id: string; wallet: string; username?: string | null; profilePic?: string | null }[]
  // Controlled mode: parent can set selected bidder (e.g., when clicking a bid card)
  selectedBidderId?: string | null
  onBidderChange?: (bidderId: string | null) => void
  /** Optional content rendered at the top of the message area (e.g. pinned submission) */
  pinnedContent?: ReactNode
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'
]
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

export default function Chat({ taskId, isCreator, bidders = [], selectedBidderId: controlledBidderId, onBidderChange, pinnedContent }: ChatProps) {
  const { authFetch, isAuthenticated, wallet } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [internalBidderId, setInternalBidderId] = useState<string | null>(null)
  
  // Use controlled value if provided, otherwise use internal state
  const selectedBidderId = controlledBidderId !== undefined ? controlledBidderId : internalBidderId
  const setSelectedBidderId = (id: string | null) => {
    if (onBidderChange) {
      onBidderChange(id)
    } else {
      setInternalBidderId(id)
    }
  }
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // For creators: fetch conversation list when no bidder selected
  const fetchConversations = async () => {
    if (!isAuthenticated || !isCreator) return
    try {
      const res = await authFetch(`/api/tasks/${taskId}/messages`)
      const data = await res.json()
      if (data.success && data.conversations) {
        setConversations(data.conversations)
        // Auto-select first conversation if available
        if (data.conversations.length > 0 && !selectedBidderId) {
          setSelectedBidderId(data.conversations[0].bidderId)
        }
      }
    } catch {
      // silent
    }
  }

  const fetchMessages = async () => {
    if (!isAuthenticated) return
    // Creator needs a selected bidder to fetch messages
    if (isCreator && !selectedBidderId) {
      await fetchConversations()
      return
    }
    try {
      const since = messages.length > 0 ? messages[messages.length - 1].createdAt : ''
      let url = `/api/tasks/${taskId}/messages`
      const params = new URLSearchParams()
      if (isCreator && selectedBidderId) {
        params.set('bidderId', selectedBidderId)
      }
      if (since) {
        params.set('since', since)
      }
      if (params.toString()) {
        url += `?${params.toString()}`
      }
      const res = await authFetch(url)
      const data = await res.json()
      if (data.success && data.messages) {
        if (since && data.messages.length > 0) {
          // Deduplicate by ID to avoid duplicates from optimistic updates
          setMessages((prev) => {
            const existingIds = new Set(prev.map(m => m.id))
            const newMessages = data.messages.filter((m: Message) => !existingIds.has(m.id))
            return [...prev, ...newMessages]
          })
        } else if (!since) {
          setMessages(data.messages)
        }
      }
    } catch {
      // silent retry
    }
  }

  // Track previous message count to only scroll on new messages
  const prevMessageCountRef = useRef(0)
  const isInitialLoadRef = useRef(true)

  // Reset messages when selected bidder changes
  useEffect(() => {
    setMessages([])
    isInitialLoadRef.current = true
    prevMessageCountRef.current = 0
  }, [selectedBidderId])

  useEffect(() => {
    if (isCreator) {
      fetchConversations()
    }
  }, [isAuthenticated, taskId, isCreator])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 5000)
    return () => clearInterval(interval)
  }, [isAuthenticated, taskId, selectedBidderId])

  // Only scroll to bottom when NEW messages are added (not on initial load or polling with no new messages)
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && !isInitialLoadRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCountRef.current = messages.length
    // After first render with messages, mark initial load as done
    if (isInitialLoadRef.current && messages.length > 0) {
      isInitialLoadRef.current = false
    }
  }, [messages])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles: File[] = []

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Invalid file type: ${file.name}`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File too large: ${file.name} (max 100MB)`)
        continue
      }
      validFiles.push(file)
    }

    if (pendingFiles.length + validFiles.length > 10) {
      setError('Maximum 10 files per message')
      return
    }

    setPendingFiles((prev) => [...prev, ...validFiles])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadFile = async (file: File): Promise<Attachment | null> => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await authFetch('/api/upload', {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || 'Upload failed')

    return {
      url: data.url,
      key: data.key,
      contentType: data.contentType,
      size: data.size,
      filename: file.name,
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && pendingFiles.length === 0) || sending) return
    // Creator must select a bidder to message
    if (isCreator && !selectedBidderId) {
      setError('Select a bidder to message')
      return
    }
    setError('')
    setSending(true)

    try {
      // Upload files first
      const attachments: Attachment[] = []
      if (pendingFiles.length > 0) {
        setUploading(true)
        for (const file of pendingFiles) {
          const att = await uploadFile(file)
          if (att) attachments.push(att)
        }
        setUploading(false)
      }

      // Send message with attachments
      const body: any = {}
      if (input.trim()) body.content = input.trim()
      if (attachments.length > 0) body.attachments = attachments
      // Creator must specify recipient
      if (isCreator && selectedBidderId) {
        body.recipientId = selectedBidderId
      }

      const res = await authFetch(`/api/tasks/${taskId}/messages`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      setMessages((prev) => [...prev, data.message])
      setInput('')
      setPendingFiles([])
    } catch (e: any) {
      setError(e.message || 'Failed to send')
      setUploading(false)
    } finally {
      setSending(false)
    }
  }

  if (!isAuthenticated) {
    return <p className="text-sm text-zinc-500">Sign in to view messages.</p>
  }

  // Get the selected bidder's wallet and profile pic for display
  const selectedBidder = isCreator
    ? conversations.find(c => c.bidderId === selectedBidderId) || bidders.find(b => b.id === selectedBidderId)
    : null
  const selectedBidderWallet = selectedBidder
    ? ('bidderWallet' in selectedBidder ? selectedBidder.bidderWallet : selectedBidder.wallet)
    : null
  const selectedBidderProfilePic = selectedBidder
    ? ('bidderProfilePic' in selectedBidder ? selectedBidder.bidderProfilePic : (selectedBidder as { profilePic?: string | null }).profilePic)
    : null

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] flex-col rounded-xl border border-k-border">
      <div className="border-b border-k-border px-4 py-3">
        <h3 className="text-sm font-semibold text-white">
            {isCreator ? 'Private Messages' : 'Messages with Task Creator'}
          </h3>
        {isCreator && selectedBidderWallet && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
            <span>Conversation with</span>
            <Link href={`/u/${selectedBidderWallet}`} className="inline-flex items-center gap-1.5 hover:text-zinc-300">
              {selectedBidderProfilePic ? (
                <img src={selectedBidderProfilePic} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[8px] font-medium text-zinc-300">
                  {selectedBidderWallet.slice(0, 2)}
                </span>
              )}
              <span>{selectedBidder && 'bidderUsername' in selectedBidder && selectedBidder.bidderUsername ? selectedBidder.bidderUsername : selectedBidder && 'username' in selectedBidder && (selectedBidder as { username?: string | null }).username ? (selectedBidder as { username?: string | null }).username : `${selectedBidderWallet.slice(0, 6)}...${selectedBidderWallet.slice(-4)}`}</span>
            </Link>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Pinned content (e.g. selected submission) */}
        {pinnedContent && (isCreator ? selectedBidderId : true) && (
          <div className="mb-3">
            {pinnedContent}
          </div>
        )}
        {isCreator && !selectedBidderId && (
          <p className="text-center text-sm text-zinc-400">
            {conversations.length > 0 || bidders.length > 0
              ? 'Select an entry to view their submission and conversation.'
              : 'No entries yet. Submissions will appear when participants enter.'}
          </p>
        )}
        {(isCreator ? selectedBidderId : true) && messages.length === 0 && !pinnedContent && (
          <p className="text-center text-sm text-zinc-400">No messages yet.</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderWallet === wallet
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && (
                <Link href={`/u/${msg.senderWallet}`} className="mr-2 flex-shrink-0 hover:opacity-80">
                  {msg.senderProfilePic ? (
                    <img src={msg.senderProfilePic} alt="" className="h-[35px] w-[35px] rounded-full object-cover" />
                  ) : (
                    <div className="flex h-[35px] w-[35px] items-center justify-center rounded-full bg-zinc-700 text-xs font-medium text-zinc-300">
                      {msg.senderWallet.slice(0, 2)}
                    </div>
                  )}
                </Link>
              )}
              <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                isMe
                  ? 'bg-accent text-black'
                  : 'bg-zinc-700/50 text-zinc-100'
              }`}>
                {!isMe && (
                  <Link href={`/u/${msg.senderWallet}`} className="mb-0.5 block text-xs font-medium opacity-60 hover:opacity-100">
                    {msg.senderUsername || `${msg.senderWallet.slice(0, 4)}...${msg.senderWallet.slice(-4)}`}
                  </Link>
                )}
                {msg.content && <p>{msg.content}</p>}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {msg.attachments.map((att, i) => (
                      <div key={i}>
                        {att.contentType.startsWith('image/') ? (
                          <a href={att.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={att.url}
                              alt={att.filename || 'attachment'}
                              className="max-w-full rounded-lg max-h-48 object-cover"
                            />
                          </a>
                        ) : att.contentType.startsWith('video/') ? (
                          <video
                            src={proxyUrl(att.url)}
                            controls
                            playsInline
                            preload="metadata"
                            className="max-w-full rounded-lg max-h-48"
                          />
                        ) : (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 underline text-xs"
                          >
                            {att.filename || 'Download attachment'}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="px-4 py-1 text-xs text-red-400">{error}</div>
      )}

      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2 border-t border-k-border">
          {pendingFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1 rounded-lg bg-surface px-2 py-1 text-xs"
            >
              <span className="max-w-[100px] truncate text-zinc-300">
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => removePendingFile(i)}
                className="ml-1 text-zinc-400 hover:text-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-k-border p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className="rounded-lg border border-k-border p-2 text-zinc-500 hover:bg-surface-hover hover:text-zinc-300 disabled:opacity-50"
          title="Attach image or video"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-k-border bg-surface px-3 py-2 text-sm focus:outline-none text-zinc-100"
        />
        <button
          type="submit"
          disabled={sending || (!input.trim() && pendingFiles.length === 0)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : sending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  )
}
