#!/usr/bin/env tsx
/**
 * Send a message on a task (private conversation)
 *
 * Messages are private between the task creator and each bidder.
 * - Bidders: no --recipient needed, message goes to creator automatically
 * - Creators: MUST provide --recipient (bidder's user ID) to specify who to message
 *
 * Usage:
 *   npm run skill:messages:send -- --task "uuid" --message "Hello" --password "pass"
 *   npm run skill:messages:send -- --task "uuid" --message "Hello" --password "pass" --recipient "bidder-user-id"
 */

import { getKeypair } from './lib/wallet'
import { apiRequest, parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.message || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --message, --password. Creators must also provide --recipient (bidder user ID)',
      usage: 'npm run skill:messages:send -- --task "uuid" --message "Hello" --password "pass" [--recipient "bidder-id"]',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const body: any = {
      content: args.message,
    }
    // For creators, recipientId is required
    if (args.recipient) {
      body.recipientId = args.recipient
    }
    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/messages`, body)
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
