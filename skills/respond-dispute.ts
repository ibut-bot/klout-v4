#!/usr/bin/env tsx
/**
 * Respond to a dispute raised against you.
 * Only the other party (not the one who raised the dispute) can respond.
 *
 * Usage:
 *   npm run skill:dispute:respond -- --dispute "dispute-uuid" --reason "My counter-argument" --password "pass" [--evidence "url1,url2"]
 */

import { getKeypair } from './lib/wallet'
import { apiRequest, parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.dispute || !args.reason || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --dispute, --reason, --password',
      usage: 'npm run skill:dispute:respond -- --dispute "dispute-uuid" --reason "My response" --password "pass" [--evidence "url1,url2"]',
    }))
    process.exit(1)
  }

  if (args.reason.length < 10) {
    console.log(JSON.stringify({
      success: false,
      error: 'INVALID_REASON',
      message: 'Reason must be at least 10 characters',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)

    // Parse evidence URLs
    const evidenceUrls = args.evidence ? args.evidence.split(',').map((u: string) => u.trim()).filter(Boolean) : []

    const result = await apiRequest(keypair, 'POST', `/api/disputes/${args.dispute}/respond`, {
      reason: args.reason,
      evidenceUrls,
    })

    if (!result.success) {
      console.log(JSON.stringify({
        success: false,
        error: result.error || 'RESPOND_FAILED',
        message: result.message || 'Failed to respond to dispute',
      }))
      process.exit(1)
    }

    console.log(JSON.stringify({
      success: true,
      disputeId: args.dispute,
      responseReason: args.reason,
      evidenceUrls,
      message: 'Response submitted successfully. The arbiter will review both sides.',
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'RESPOND_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
