#!/usr/bin/env tsx
/**
 * List bids for a task
 *
 * Usage:
 *   npm run skill:bids:list -- --task "task-uuid"
 */

import { parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.task) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task',
      usage: 'npm run skill:bids:list -- --task "task-uuid"',
    }))
    process.exit(1)
  }

  try {
    const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'
    const res = await fetch(`${base}/api/tasks/${args.task}/bids`)
    const data = await res.json()
    console.log(JSON.stringify(data))
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
