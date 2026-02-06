/**
 * RPC connection for CLI skill scripts
 */

import { Connection } from '@solana/web3.js'
import { config } from 'dotenv'
import * as path from 'path'

// Load .env from project root
config({ path: path.join(__dirname, '..', '..', '.env') })

const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com'

function getCliRpcUrl(): string | null {
  const args = process.argv
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rpc-url' && args[i + 1]) return args[i + 1]
  }
  return null
}

export function getRpcUrl(): string {
  return getCliRpcUrl() || process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL
}

export function getConnection(): Connection {
  return new Connection(getRpcUrl(), 'confirmed')
}
