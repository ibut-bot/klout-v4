#!/usr/bin/env tsx
/**
 * List bids placed by the authenticated user.
 *
 * Usage:
 *   npm run skill:me:bids -- --password "pass" [--status PENDING|ACCEPTED|FUNDED|PAYMENT_REQUESTED|COMPLETED|REJECTED|DISPUTED] [--limit 20] [--page 1]
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
      usage: 'npm run skill:me:bids -- --password "pass" [--status FUNDED] [--limit 20] [--page 1]',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)

    const params = new URLSearchParams()
    if (args.status) params.set('status', args.status.toUpperCase())
    if (args.limit) params.set('limit', args.limit)
    if (args.page) params.set('page', args.page)

    const endpoint = `/api/me/bids${params.toString() ? '?' + params.toString() : ''}`
    const result = await apiRequest(keypair, 'GET', endpoint)

    if (!result.success) {
      console.log(JSON.stringify({
        success: false,
        error: result.error || 'LIST_FAILED',
        message: result.message || 'Failed to list bids',
      }))
      process.exit(1)
    }

    const bids = result.bids.map((b: any) => ({
      id: b.id,
      amountSol: Number(b.amountLamports) / LAMPORTS_PER_SOL,
      status: b.status,
      isWinningBid: b.isWinningBid,
      createdAt: b.createdAt,
      multisigAddress: b.multisigAddress,
      vaultAddress: b.vaultAddress,
      task: {
        id: b.task.id,
        title: b.task.title,
        budgetSol: Number(b.task.budgetLamports) / LAMPORTS_PER_SOL,
        status: b.task.status,
        creatorWallet: b.task.creatorWallet,
        url: b.task.url,
      },
    }))

    console.log(JSON.stringify({
      success: true,
      bids,
      pagination: result.pagination,
      message: `Found ${bids.length} bid(s) you placed`,
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
