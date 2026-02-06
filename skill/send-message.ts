#!/usr/bin/env tsx
/**
 * Send a message on a task
 *
 * Usage:
 *   npm run skill:messages:send -- --task "uuid" --message "Hello" --password "pass"
 */

import { getKeypair } from './lib/wallet'
import { apiRequest, parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.message || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --message, --password',
      usage: 'npm run skill:messages:send -- --task "uuid" --message "Hello" --password "pass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/messages`, {
      content: args.message,
    })
    console.log(JSON.stringify(result))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'SEND_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
