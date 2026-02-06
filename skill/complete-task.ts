#!/usr/bin/env tsx
/**
 * DEPRECATED: Use the proper payment flow instead.
 *
 * The correct flow to complete a task and release payment:
 *   1. Bidder runs:  npm run skill:escrow:request -- --task "uuid" --bid "uuid" --password "pass"
 *   2. Creator runs: npm run skill:escrow:approve -- --task "uuid" --bid "uuid" --password "pass"
 *
 * This script is kept for reference only.
 */

console.log(JSON.stringify({
  success: false,
  error: 'DEPRECATED',
  message: 'This command is deprecated. Use the multisig payment flow instead.',
  correctFlow: {
    step1: {
      who: 'Bidder (after completing the task)',
      command: 'npm run skill:escrow:request -- --task "TASK_ID" --bid "BID_ID" --password "PASS"',
      description: 'Creates on-chain transfer proposal + self-approves, records on API',
    },
    step2: {
      who: 'Task Creator (to release payment)',
      command: 'npm run skill:escrow:approve -- --task "TASK_ID" --bid "BID_ID" --password "PASS"',
      description: 'Approves proposal (2/3 threshold met), executes vault tx, records completion',
    },
  },
}))
