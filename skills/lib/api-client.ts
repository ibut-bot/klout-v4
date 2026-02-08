/**
 * HTTP client for skill scripts that handles JWT auth automatically.
 * Caches tokens to .slopwork-session.json in the project root.
 */

import * as fs from 'fs'
import * as path from 'path'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { Keypair } from '@solana/web3.js'

const SESSION_FILE = path.join(__dirname, '..', '..', '.slopwork-session.json')

interface Session {
  token: string
  wallet: string
  expiresAt: number
}

function getBaseUrl(): string {
  return process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'
}

function loadSession(): Session | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'))
    // Check expiry with 5 min buffer
    if (data.expiresAt && data.expiresAt > Date.now() / 1000 + 300) {
      return data
    }
    return null
  } catch {
    return null
  }
}

function saveSession(session: Session): void {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2))
}

/** Authenticate using a keypair: get nonce, sign it, get JWT */
async function authenticate(keypair: Keypair): Promise<Session> {
  const base = getBaseUrl()
  const wallet = keypair.publicKey.toBase58()

  // Get nonce
  const nonceRes = await fetch(`${base}/api/auth/nonce?wallet=${wallet}`)
  const nonceData = await nonceRes.json()
  if (!nonceData.success) {
    throw new Error(`Failed to get nonce: ${nonceData.message}`)
  }

  // Sign the message
  const messageBytes = new TextEncoder().encode(nonceData.message)
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey)
  const signature = bs58.encode(signatureBytes)

  // Verify
  const verifyRes = await fetch(`${base}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, signature, nonce: nonceData.nonce }),
  })
  const verifyData = await verifyRes.json()
  if (!verifyData.success) {
    throw new Error(`Auth failed: ${verifyData.message}`)
  }

  const session: Session = {
    token: verifyData.token,
    wallet,
    expiresAt: verifyData.expiresAt,
  }
  saveSession(session)
  return session
}

/** Get a valid JWT, refreshing if needed */
export async function getToken(keypair: Keypair): Promise<string> {
  const session = loadSession()
  if (session && session.wallet === keypair.publicKey.toBase58()) {
    return session.token
  }
  const newSession = await authenticate(keypair)
  return newSession.token
}

/** Make an authenticated API request */
export async function apiRequest(
  keypair: Keypair,
  method: string,
  endpoint: string,
  body?: any
): Promise<any> {
  const base = getBaseUrl()
  const token = await getToken(keypair)

  const res = await fetch(`${base}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  return res.json()
}

/** Cached public config from /api/config */
let _publicConfig: any = null

/** Fetch public server config (system wallet, fees, network). Cached after first call. */
export async function getPublicConfig(): Promise<any> {
  if (_publicConfig) return _publicConfig

  const base = getBaseUrl()
  const res = await fetch(`${base}/api/config`)
  const data = await res.json()
  if (!data.success) {
    throw new Error(`Failed to fetch config: ${JSON.stringify(data)}`)
  }
  _publicConfig = data.config
  return _publicConfig
}

/** Parse CLI args into a key-value map */
export function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2)
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) {
      result[args[i].slice(2)] = args[++i]
    } else if (args[i].startsWith('--')) {
      result[args[i].slice(2)] = 'true'
    }
  }
  return result
}

/** Upload a file via multipart form data */
export async function uploadFile(
  keypair: Keypair,
  filePath: string
): Promise<any> {
  const base = getBaseUrl()
  const token = await getToken(keypair)

  const fileBuffer = fs.readFileSync(filePath)
  const filename = path.basename(filePath)

  // Determine content type from extension
  const ext = path.extname(filePath).toLowerCase().slice(1)
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
  }
  const contentType = mimeTypes[ext] || 'application/octet-stream'

  // Build multipart form data manually (Node.js compatible)
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2)
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`

  const body = Buffer.concat([
    Buffer.from(header),
    fileBuffer,
    Buffer.from(footer),
  ])

  const res = await fetch(`${base}/api/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  return res.json()
}
