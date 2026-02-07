/** GET /api/health -- Server health and chain status */

import { getConnection } from '@/lib/solana/connection'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  let blockHeight: number | null = null
  let rpcOk = false

  try {
    const connection = getConnection()
    blockHeight = await connection.getBlockHeight()
    rpcOk = true
  } catch {
    // RPC unreachable
  }

  return Response.json({
    success: true,
    status: rpcOk ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    solana: {
      network: process.env.SOLANA_NETWORK || 'mainnet',
      blockHeight,
      rpcOk,
    },
    latencyMs: Date.now() - start,
  })
}
