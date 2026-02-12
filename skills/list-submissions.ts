#!/usr/bin/env tsx
/**
 * List submissions for a task (requires authentication)
 *
 * Usage:
 *   npm run skill:submissions:list -- --task "task-uuid" --password "pass"
 *   npm run skill:submissions:list -- --task "task-uuid" --password "pass" --bid "bid-uuid"
 *
 * Options:
 *   --task      Task ID (required)
 *   --password  Wallet password (required — endpoint requires auth)
 *   --bid       Bid ID (optional, filter by specific bid)
 */

import { parseArgs, apiRequest } from './lib/api-client'
import { getKeypair } from './lib/wallet'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --password',
      usage: 'npm run skill:submissions:list -- --task "uuid" --password "pass" [--bid "uuid"]',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const data = await apiRequest(keypair, 'GET', `/api/tasks/${args.task}/submissions`)

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
