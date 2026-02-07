#!/usr/bin/env tsx
/**
 * Get details of a specific task
 *
 * Usage:
 *   npm run skill:tasks:get -- --id "task-uuid"
 */

import { parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.id) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --id',
      usage: 'npm run skill:tasks:get -- --id "task-uuid"',
    }))
    process.exit(1)
  }

  try {
    const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'
    const res = await fetch(`${base}/api/tasks/${args.id}`)
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
