#!/usr/bin/env tsx
/**
 * List submissions for a task
 *
 * Usage:
 *   npm run skill:submissions:list -- --task "task-uuid"
 *   npm run skill:submissions:list -- --task "task-uuid" --bid "bid-uuid"
 *
 * Options:
 *   --task    Task ID (required)
 *   --bid     Bid ID (optional, filter by specific bid)
 */

import { parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.task) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task',
      usage: 'npm run skill:submissions:list -- --task "uuid" [--bid "uuid"]',
    }))
    process.exit(1)
  }

  try {
    const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'
    const res = await fetch(`${base}/api/tasks/${args.task}/submissions`)
    const data = await res.json()

    if (!data.success) {
      console.log(JSON.stringify(data))
      process.exit(1)
    }

    let submissions = data.submissions
    if (args.bid) {
      submissions = submissions.filter((s: any) => s.bidId === args.bid)
    }

    console.log(JSON.stringify({
      success: true,
      taskType: data.taskType,
      count: submissions.length,
      submissions,
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
