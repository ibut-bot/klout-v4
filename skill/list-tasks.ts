#!/usr/bin/env tsx
/**
 * List tasks from the Slopwork marketplace
 *
 * Usage:
 *   npm run skill:tasks:list
 *   npm run skill:tasks:list -- --status open --limit 10 --page 1
 *
 * Options:
 *   --status   Filter: open, in_progress, completed, disputed, cancelled
 *   --limit    Results per page (default 20, max 50)
 *   --page     Page number (default 1)
 */

import { parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'

  const params = new URLSearchParams()
  if (args.status) params.set('status', args.status)
  if (args.limit) params.set('limit', args.limit)
  if (args.page) params.set('page', args.page)

  try {
    const res = await fetch(`${base}/api/tasks?${params}`)
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
