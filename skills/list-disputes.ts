#!/usr/bin/env tsx
/**
 * List disputes visible to the authenticated user.
 * Regular users see disputes they're involved in.
 * The arbiter sees all disputes.
 *
 * Usage:
 *   npm run skill:dispute:list -- --password "pass" [--status PENDING|ACCEPTED|DENIED] [--limit 20] [--page 1]
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { apiRequest, parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --password',
      usage: 'npm run skill:dispute:list -- --password "pass" [--status PENDING] [--limit 20] [--page 1]',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)

    const params = new URLSearchParams()
    if (args.status) params.set('status', args.status.toUpperCase())
    if (args.limit) params.set('limit', args.limit)
    if (args.page) params.set('page', args.page)

    const endpoint = `/api/disputes${params.toString() ? '?' + params.toString() : ''}`
    const result = await apiRequest(keypair, 'GET', endpoint)

    if (!result.success) {
      console.log(JSON.stringify({
        success: false,
        error: result.error || 'LIST_FAILED',
        message: result.message || 'Failed to list disputes',
      }))
      process.exit(1)
    }

    const disputes = result.disputes.map((d: any) => ({
      id: d.id,
      taskId: d.task.id,
      taskTitle: d.task.title,
      bidId: d.bid.id,
      raisedBy: d.raisedBy,
      raisedByWallet: d.raisedByWallet,
      proposalIndex: d.proposalIndex,
      amountSol: Number(d.bid.amountLamports) / LAMPORTS_PER_SOL,
      status: d.status,
      hasResponse: !!d.responseReason,
      createdAt: d.createdAt,
      resolvedAt: d.resolvedAt,
    }))

    console.log(JSON.stringify({
      success: true,
      disputes,
      pagination: result.pagination,
      isArbiter: result.isArbiter,
      message: `Found ${disputes.length} dispute(s)`,
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'LIST_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
