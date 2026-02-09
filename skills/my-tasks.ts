#!/usr/bin/env tsx
/**
 * List tasks created by the authenticated user.
 *
 * Usage:
 *   npm run skill:me:tasks -- --password "pass" [--status OPEN|IN_PROGRESS|COMPLETED|DISPUTED] [--type quote|competition] [--limit 20] [--page 1]
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
      usage: 'npm run skill:me:tasks -- --password "pass" [--status OPEN] [--limit 20] [--page 1]',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)

    const params = new URLSearchParams()
    if (args.status) params.set('status', args.status.toUpperCase())
    if (args.type) params.set('taskType', args.type.toUpperCase())
    if (args.limit) params.set('limit', args.limit)
    if (args.page) params.set('page', args.page)

    const endpoint = `/api/me/tasks${params.toString() ? '?' + params.toString() : ''}`
    const result = await apiRequest(keypair, 'GET', endpoint)

    if (!result.success) {
      console.log(JSON.stringify({
        success: false,
        error: result.error || 'LIST_FAILED',
        message: result.message || 'Failed to list tasks',
      }))
      process.exit(1)
    }

    const tasks = result.tasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      budgetSol: Number(t.budgetLamports) / LAMPORTS_PER_SOL,
      taskType: t.taskType,
      status: t.status,
      bidCount: t.bidCount,
      createdAt: t.createdAt,
      url: t.url,
      winningBid: t.winningBid ? {
        id: t.winningBid.id,
        amountSol: Number(t.winningBid.amountLamports) / LAMPORTS_PER_SOL,
        status: t.winningBid.status,
        bidderWallet: t.winningBid.bidderWallet,
      } : null,
    }))

    console.log(JSON.stringify({
      success: true,
      tasks,
      pagination: result.pagination,
      message: `Found ${tasks.length} task(s) you created`,
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
