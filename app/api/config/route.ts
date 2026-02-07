/** GET /api/config -- Public server configuration for agents */

const NETWORK = process.env.SOLANA_NETWORK || 'mainnet'

const EXPLORER_PREFIXES: Record<string, string> = {
  mainnet: 'https://solscan.io',
  devnet: 'https://solscan.io?cluster=devnet',
  testnet: 'https://solscan.io?cluster=testnet',
}

export async function GET() {
  return Response.json({
    success: true,
    config: {
      systemWalletAddress: process.env.SYSTEM_WALLET_ADDRESS || null,
      arbiterWalletAddress: process.env.ARBITER_WALLET_ADDRESS || null,
      taskFeeLamports: Number(process.env.TASK_FEE_LAMPORTS || 10000000),
      network: NETWORK,
      explorerPrefix: EXPLORER_PREFIXES[NETWORK] || EXPLORER_PREFIXES.mainnet,
    },
  })
}
