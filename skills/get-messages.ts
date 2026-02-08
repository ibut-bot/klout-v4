#!/usr/bin/env tsx
/**
 * Get messages for a task (private conversation)
 *
 * Messages are private between the task creator and each bidder.
 * - Bidders: no --bidder needed, will see their conversation with creator
 * - Creators: must provide --bidder to specify which bidder's conversation to view
 *   OR omit --bidder to get list of available conversations
 *
 * Usage:
 *   npm run skill:messages:get -- --task "uuid" --password "pass"
 *   npm run skill:messages:get -- --task "uuid" --password "pass" --bidder "bidder-user-id"
 *   npm run skill:messages:get -- --task "uuid" --password "pass" --since "2024-01-01T00:00:00Z"
 */

import { getKeypair } from './lib/wallet'
import { apiRequest, parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --password. Optional: --bidder (for creators), --since',
      usage: 'npm run skill:messages:get -- --task "uuid" --password "pass" [--bidder "bidder-id"]',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const params = new URLSearchParams()
    if (args.bidder) {
      params.set('bidderId', args.bidder)
    }
    if (args.since) {
      params.set('since', args.since)
    }
    const queryString = params.toString()
    const endpoint = `/api/tasks/${args.task}/messages${queryString ? `?${queryString}` : ''}`
    const result = await apiRequest(keypair, 'GET', endpoint)
    console.log(JSON.stringify(result))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'FETCH_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
