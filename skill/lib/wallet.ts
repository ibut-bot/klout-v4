/**
 * Wallet utilities for CLI skill scripts.
 * Supports two wallet formats:
 *   1. Slopwork format — ~/.solana-wallet/wallet.json (encrypted/iv/salt hex fields)
 *   2. My-Solana-Wallet (MSW) format — wallet-data/solana_wallet stored via FileStorage
 *      (single base64 blob: salt+iv+authTag+ciphertext, encrypts JSON array of secret key bytes)
 *
 * Tries slopwork format first, then falls back to MSW.
 */

import { Keypair } from '@solana/web3.js'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const HOME = process.env.HOME || '~'
const WALLET_DIR = path.join(HOME, '.solana-wallet')
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.json')

// MSW stores "solana_wallet" key as base64url-encoded filename
const MSW_WALLET_FILENAME = Buffer.from('solana_wallet').toString('base64url') + '.json'

// Possible MSW wallet-data locations (checked in order)
function getMSWSearchPaths(): string[] {
  const paths: string[] = []
  // Explicit env override
  if (process.env.MSW_WALLET_DIR) {
    paths.push(path.join(process.env.MSW_WALLET_DIR, MSW_WALLET_FILENAME))
  }
  // OpenClaw installed location
  paths.push(path.join(HOME, '.openclaw', 'skills', 'my-solana-wallet', 'wallet-data', MSW_WALLET_FILENAME))
  // Sibling project (common in development)
  paths.push(path.join(__dirname, '..', '..', '..', 'my-solana-wallet', 'wallet-data', MSW_WALLET_FILENAME))
  return paths
}

// ---------- Slopwork format ----------

interface SlopworkWalletData {
  encrypted: string
  iv: string
  salt: string
  name?: string
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256')
}

function trySlopworkFormat(password: string): Keypair | null {
  if (!fs.existsSync(WALLET_FILE)) return null

  try {
    const data: SlopworkWalletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'))
    if (!data.iv || !data.salt || !data.encrypted) return null

    const saltBuf = Buffer.from(data.salt, 'hex')
    const key = deriveKey(password, saltBuf)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'hex'))

    const encBuf = Buffer.from(data.encrypted, 'hex')
    const authTag = encBuf.subarray(encBuf.length - 16)
    const ciphertext = encBuf.subarray(0, encBuf.length - 16)

    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return Keypair.fromSecretKey(new Uint8Array(decrypted))
  } catch {
    return null
  }
}

// ---------- My-Solana-Wallet format ----------

interface MSWWalletData {
  name: string
  publicKey: string
  encryptedSecretKey: string
  createdAt: number
}

function decryptMSW(encryptedBase64: string, password: string): Uint8Array {
  const combined = Buffer.from(encryptedBase64, 'base64')

  const salt = combined.subarray(0, 16)
  const iv = combined.subarray(16, 28)
  const authTag = combined.subarray(28, 44)
  const ciphertext = combined.subarray(44)

  const key = deriveKey(password, salt)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  // MSW encrypts JSON.stringify(Array.from(secretKey)), so parse it back
  const secretKeyArray: number[] = JSON.parse(decrypted.toString('utf-8'))
  return new Uint8Array(secretKeyArray)
}

function tryMSWFormat(password: string): Keypair | null {
  for (const walletPath of getMSWSearchPaths()) {
    if (!fs.existsSync(walletPath)) continue

    try {
      const data: MSWWalletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'))
      if (!data.encryptedSecretKey) continue

      const secretKey = decryptMSW(data.encryptedSecretKey, password)
      return Keypair.fromSecretKey(secretKey)
    } catch {
      continue
    }
  }
  return null
}

// ---------- Public API ----------

/** Load a Keypair by trying slopwork format first, then MSW format */
export function getKeypair(password: string): Keypair {
  // Try slopwork format
  const slopwork = trySlopworkFormat(password)
  if (slopwork) return slopwork

  // Try my-solana-wallet format
  const msw = tryMSWFormat(password)
  if (msw) return msw

  throw new Error(
    'No wallet found. Expected one of:\n' +
    `  - Slopwork format at ${WALLET_FILE}\n` +
    `  - My-Solana-Wallet format at one of:\n` +
    getMSWSearchPaths().map((p) => `      ${p}`).join('\n') +
    '\nCreate a wallet with my-solana-wallet or set MSW_WALLET_DIR to your wallet-data directory.'
  )
}

/** Get wallet address without needing password */
export function getAddress(): string | null {
  try {
    // Try slopwork address file
    const addrFile = path.join(WALLET_DIR, 'address.txt')
    if (fs.existsSync(addrFile)) {
      return fs.readFileSync(addrFile, 'utf-8').trim()
    }
    // Try MSW wallet data (publicKey is stored unencrypted)
    for (const walletPath of getMSWSearchPaths()) {
      if (!fs.existsSync(walletPath)) continue
      try {
        const data: MSWWalletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'))
        if (data.publicKey) return data.publicKey
      } catch {
        continue
      }
    }
    return null
  } catch {
    return null
  }
}
