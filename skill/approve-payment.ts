#!/usr/bin/env tsx
/**
 * Approve and release payment for a completed task (task creator only).
 * Approves the on-chain proposal, executes the vault transaction, and records on API.
 *
 * Usage:
 *   npm run skill:escrow:approve -- --task "task-uuid" --bid "bid-uuid" --password "pass"
 *
 * What it does:
 *   1. Fetches task details to get multisig address and proposal index
 *   2. Approves the on-chain proposal (your 2/3 signature -- threshold met)
 *   3. Executes the vault transaction (releases SOL to bidder)
 *   4. Records completion on the API (bid -> COMPLETED, task -> COMPLETED)
 *
 * This is the final step that releases escrowed funds to the bidder.
 */

import { PublicKey } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs } from './lib/api-client'
import { approveProposal, executeVaultTransaction } from '../lib/solana/multisig'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.bid || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --bid, --password',
      usage: 'npm run skill:escrow:approve -- --task "task-uuid" --bid "bid-uuid" --password "pass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const connection = getConnection()
    const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'

    // Fetch task to get multisig address and proposal index
    const taskRes = await fetch(`${base}/api/tasks/${args.task}`)
    const taskData = await taskRes.json()
    if (!taskData.success || !taskData.task.winningBid) {
      console.log(JSON.stringify({
        success: false,
        error: 'INVALID_TASK',
        message: 'Task not found or has no winning bid',
      }))
      process.exit(1)
    }

    const wb = taskData.task.winningBid
    if (wb.id !== args.bid) {
      console.log(JSON.stringify({
        success: false,
        error: 'NOT_WINNING_BID',
        message: 'The specified bid is not the winning bid for this task',
      }))
      process.exit(1)
    }

    if (wb.status !== 'PAYMENT_REQUESTED') {
      console.log(JSON.stringify({
        success: false,
        error: 'INVALID_STATUS',
        message: `Bid status is ${wb.status}, must be PAYMENT_REQUESTED to approve payment`,
      }))
      process.exit(1)
    }

    if (!wb.multisigAddress || wb.proposalIndex === null) {
      console.log(JSON.stringify({
        success: false,
        error: 'MISSING_DATA',
        message: 'Missing multisig address or proposal index on the bid',
      }))
      process.exit(1)
    }

    const multisigPda = new PublicKey(wb.multisigAddress)
    const proposalIndex = BigInt(wb.proposalIndex)

    // Approve on-chain (2/3 threshold met)
    console.error(`Approving proposal #${wb.proposalIndex}...`)
    const approveSig = await approveProposal(connection, keypair, multisigPda, proposalIndex)

    // Execute vault transaction (release funds)
    console.error('Executing vault transaction...')
    const executeSig = await executeVaultTransaction(connection, keypair, multisigPda, proposalIndex)

    // Record on API
    console.error('Recording completion on API...')
    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/bids/${args.bid}/approve-payment`, {
      approveTxSignature: approveSig,
      executeTxSignature: executeSig,
    })

    console.log(JSON.stringify({
      success: true,
      proposalIndex: wb.proposalIndex,
      approveSignature: approveSig,
      executeSignature: executeSig,
      apiResult: result,
      message: 'Payment approved and released! Task completed.',
      explorerUrl: `https://solscan.io/tx/${executeSig}`,
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'APPROVE_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
