#!/usr/bin/env tsx
/**
 * Get messages for a task
 *
 * Usage:
 *   npm run skill:messages:get -- --task "uuid" --password "pass"
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
      message: 'Required: --task, --password',
      usage: 'npm run skill:messages:get -- --task "uuid" --password "pass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const endpoint = args.since
      ? `/api/tasks/${args.task}/messages?since=${encodeURIComponent(args.since)}`
      : `/api/tasks/${args.task}/messages`
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
