'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import bs58 from 'bs58'
import React from 'react'

interface AuthState {
  token: string | null
  wallet: string | null
  loading: boolean
  isAuthenticated: boolean
  connected: boolean
  authenticate: () => Promise<string | null>
  authFetch: (url: string, options?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, connected } = useWallet()
  const [token, setToken] = useState<string | null>(null)
  const [wallet, setWallet] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const authenticatingRef = useRef(false)
  const didAutoAuthRef = useRef<string | null>(null)
  const hadPublicKeyRef = useRef(false)
  const signMessageRef = useRef(signMessage)
  const publicKeyRef = useRef(publicKey)
  const tokenRef = useRef(token)

  signMessageRef.current = signMessage
  publicKeyRef.current = publicKey
  tokenRef.current = token

  // On mount: restore cached token immediately (no wallet connection needed)
  useEffect(() => {
    const stored = localStorage.getItem('slopwork_token')
    const storedWallet = localStorage.getItem('slopwork_wallet')
    const storedExpiry = localStorage.getItem('slopwork_token_expiry')

    if (stored && storedWallet && storedExpiry) {
      const expiry = Number(storedExpiry)
      if (expiry > Date.now() / 1000 + 300) {
        setToken(stored)
        setWallet(storedWallet)
      }
    }
  }, [])

  const authenticate = useCallback(async () => {
    const pk = publicKeyRef.current
    const sign = signMessageRef.current
    if (!pk || !sign) return null
    if (authenticatingRef.current) return null

    authenticatingRef.current = true
    setLoading(true)

    try {
      const walletAddr = pk.toBase58()

      const nonceRes = await fetch(`/api/auth/nonce?wallet=${walletAddr}`)
      const nonceData = await nonceRes.json()
      if (!nonceData.success) throw new Error(nonceData.message)

      const messageBytes = new TextEncoder().encode(nonceData.message)
      const signatureBytes = await sign(messageBytes)
      const signature = bs58.encode(signatureBytes)

      // Include referral code if stored (from ?ref= URL param)
      const referralCode = localStorage.getItem('klout_referral_code') || undefined

      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddr, signature, nonce: nonceData.nonce, referralCode }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyData.success) throw new Error(verifyData.message)

      localStorage.setItem('slopwork_token', verifyData.token)
      localStorage.setItem('slopwork_wallet', walletAddr)
      localStorage.setItem('slopwork_token_expiry', String(verifyData.expiresAt))

      setToken(verifyData.token)
      setWallet(walletAddr)
      setLoading(false)
      return verifyData.token as string
    } catch (e) {
      console.error('Auth failed:', e)
      setLoading(false)
      return null
    } finally {
      authenticatingRef.current = false
    }
  }, [])

  // On wallet connect: restore cached token or auto-authenticate
  useEffect(() => {
    if (!publicKey) {
      // Only clear auth state if wallet was previously connected (user disconnected)
      // Don't clear on initial mount while autoConnect is pending
      if (hadPublicKeyRef.current) {
        setToken(null)
        setWallet(null)
        didAutoAuthRef.current = null
      }
      return
    }

    hadPublicKeyRef.current = true

    const walletAddr = publicKey.toBase58()

    if (didAutoAuthRef.current === walletAddr) return

    // Try to restore cached token
    const stored = localStorage.getItem('slopwork_token')
    const storedWallet = localStorage.getItem('slopwork_wallet')
    const storedExpiry = localStorage.getItem('slopwork_token_expiry')

    if (stored && storedWallet === walletAddr && storedExpiry) {
      const expiry = Number(storedExpiry)
      if (expiry > Date.now() / 1000 + 300) {
        setToken(stored)
        setWallet(storedWallet)
        didAutoAuthRef.current = walletAddr
        return
      }
    }

    // Wait for signMessage to be available
    if (!signMessage) return

    didAutoAuthRef.current = walletAddr

    const timer = setTimeout(() => {
      if (!authenticatingRef.current) {
        authenticate().then(result => {
          if (!result) didAutoAuthRef.current = null
        })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [publicKey, signMessage, authenticate])

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      let t = tokenRef.current
      if (!t) {
        t = await authenticate()
        if (!t) throw new Error('Not authenticated')
      }

      // Don't set Content-Type for FormData - browser sets it with boundary
      const isFormData = options.body instanceof FormData
      const headers: Record<string, string> = {
        Authorization: `Bearer ${t}`,
      }
      if (!isFormData) {
        headers['Content-Type'] = 'application/json'
      }

      return fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers as Record<string, string>),
        },
      })
    },
    [authenticate]
  )

  const value: AuthState = {
    token,
    wallet,
    loading,
    isAuthenticated: !!token,
    connected,
    authenticate,
    authFetch,
  }

  return React.createElement(AuthContext.Provider, { value }, children)
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
