import { Connection } from '@solana/web3.js'

const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com'

export function getRpcUrl(): string {
  return process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL
}

export function getConnection(): Connection {
  return new Connection(getRpcUrl(), 'confirmed')
}

export function createConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, 'confirmed')
}
