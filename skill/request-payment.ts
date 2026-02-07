#!/usr/bin/env tsx
/**
 * Request payment after completing a task (bidder only).
 * Creates a transfer proposal on-chain + self-approves, then records it via API.
 *
 * Usage:
 *   npm run skill:escrow:request -- --task "task-uuid" --bid "bid-uuid" --password "pass"
 *
 * What it does:
 *   1. Fetches task details to get multisig address and bid amount
 *   2. Creates an on-chain vault transaction (SOL transfer from vault to you)
 *   3. Creates a proposal for it and auto-approves (your 1/3 signature)
 *   4. Records the proposal index on the API (bid status -> PAYMENT_REQUESTED)
 *
 * After this, the task creator needs to approve to release funds.
 */

import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs } from './lib/api-client'
import { createTransferProposal, approveProposal } from '../lib/solana/multisig'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.bid || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --bid, --password',
      usage: 'npm run skill:escrow:request -- --task "task-uuid" --bid "bid-uuid" --password "pass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const connection = getConnection()
    const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'

    // Fetch task to get multisig address and amount
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

    if (wb.status !== 'FUNDED') {
      console.log(JSON.stringify({
        success: false,
        error: 'INVALID_STATUS',
        message: `Bid status is ${wb.status}, must be FUNDED to request payment`,
      }))
      process.exit(1)
    }

    if (!wb.multisigAddress) {
      console.log(JSON.stringify({
        success: false,
        error: 'NO_MULTISIG',
        message: 'Winning bid has no multisig address',
      }))
      process.exit(1)
    }

    const multisigPda = new PublicKey(wb.multisigAddress)
    const recipient = keypair.publicKey // bidder pays themselves
    const lamports = Number(wb.amountLamports)
    const platformAddr = process.env.ARBITER_WALLET_ADDRESS
    const platformWallet = platformAddr ? new PublicKey(platformAddr) : undefined

    const bidderPayout = platformWallet ? lamports - Math.floor(lamports * 0.1) : lamports
    const platformFee = platformWallet ? Math.floor(lamports * 0.1) : 0
    console.error(`Creating transfer proposal: ${(bidderPayout / LAMPORTS_PER_SOL).toFixed(4)} SOL to bidder, ${(platformFee / LAMPORTS_PER_SOL).toFixed(4)} SOL platform fee...`)

    // Create proposal on-chain (90% to bidder, 10% to platform)
    const proposal = await createTransferProposal(connection, keypair, multisigPda, recipient, lamports, `slopwork-task-${args.task}`, platformWallet)

    // Auto-approve
    console.error('Self-approving proposal...')
    const approveSig = await approveProposal(connection, keypair, multisigPda, proposal.transactionIndex)

    // Record on API
    console.error('Recording payment request on API...')
    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/bids/${args.bid}/request-payment`, {
      proposalIndex: Number(proposal.transactionIndex),
      txSignature: proposal.signature,
    })

    console.log(JSON.stringify({
      success: true,
      proposalIndex: Number(proposal.transactionIndex),
      proposalSignature: proposal.signature,
      approveSignature: approveSig,
      multisigAddress: wb.multisigAddress,
      amountSol: lamports / LAMPORTS_PER_SOL,
      apiResult: result,
      message: 'Payment requested! Waiting for task creator to approve and release funds.',
      explorerUrl: `https://solscan.io/tx/${proposal.signature}`,
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'REQUEST_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
