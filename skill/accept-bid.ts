#!/usr/bin/env tsx
/**
 * Accept a bid on your task
 *
 * Usage:
 *   npm run skill:bids:accept -- --task "task-uuid" --bid "bid-uuid" --password "pass"
 */

import { getKeypair } from './lib/wallet'
import { apiRequest, parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.bid || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --bid, --password',
      usage: 'npm run skill:bids:accept -- --task "uuid" --bid "uuid" --password "pass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/bids/${args.bid}/accept`)
    console.log(JSON.stringify(result))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'ACCEPT_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
