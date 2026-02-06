#!/usr/bin/env tsx
/**
 * Authenticate with Slopwork API using local wallet
 *
 * Usage:
 *   npm run skill:auth -- --password "mypass"
 *
 * Options:
 *   --password   Wallet password to sign the nonce
 */

import { getKeypair } from './lib/wallet'
import { getToken } from './lib/api-client'
import { parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'PASSWORD_REQUIRED',
      message: 'Please provide --password',
      usage: 'npm run skill:auth -- --password "yourpass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const token = await getToken(keypair)
    console.log(JSON.stringify({
      success: true,
      wallet: keypair.publicKey.toBase58(),
      token,
      message: 'Authenticated successfully. Token cached to .slopwork-session.json',
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'AUTH_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
