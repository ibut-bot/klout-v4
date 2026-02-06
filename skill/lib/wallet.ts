/**
 * Wallet utilities for CLI skill scripts.
 * Loads a Solana keypair from a local encrypted wallet file,
 * compatible with the my-solana-wallet format.
 */

import { Keypair } from '@solana/web3.js'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const WALLET_DIR = path.join(process.env.HOME || '~', '.solana-wallet')
const WALLET_FILE = path.join(WALLET_DIR, 'wallet.json')

interface WalletData {
  encrypted: string
  iv: string
  salt: string
  name?: string
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256')
}

function decrypt(encrypted: string, iv: string, salt: string, password: string): Buffer {
  const saltBuf = Buffer.from(salt, 'hex')
  const key = deriveKey(password, saltBuf)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))

  // The encrypted string contains both ciphertext and auth tag
  const encBuf = Buffer.from(encrypted, 'hex')
  const authTag = encBuf.subarray(encBuf.length - 16)
  const ciphertext = encBuf.subarray(0, encBuf.length - 16)

  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted
}

/** Load a Keypair from the local wallet file using a password */
export function getKeypair(password: string): Keypair {
  if (!fs.existsSync(WALLET_FILE)) {
    throw new Error(`Wallet file not found at ${WALLET_FILE}. Create one with my-solana-wallet first.`)
  }

  const data: WalletData = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'))
  const secretKeyBytes = decrypt(data.encrypted, data.iv, data.salt, password)
  return Keypair.fromSecretKey(new Uint8Array(secretKeyBytes))
}

/** Get wallet address without needing password (reads public key from wallet file if available) */
export function getAddress(): string | null {
  try {
    const addrFile = path.join(WALLET_DIR, 'address.txt')
    if (fs.existsSync(addrFile)) {
      return fs.readFileSync(addrFile, 'utf-8').trim()
    }
    return null
  } catch {
    return null
  }
}
