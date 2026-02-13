#!/usr/bin/env tsx
/**
 * Raise a dispute on a funded task (creator or bidder).
 * Creates a transfer proposal on-chain to release funds to yourself, then records the dispute.
 *
 * Usage:
 *   npm run skill:dispute:raise -- --task "task-uuid" --bid "bid-uuid" --reason "Work was not delivered as specified" --password "pass" [--evidence "url1,url2"]
 *
 * What it does:
 *   1. Creates an on-chain vault transaction (SOL transfer from vault to you)
 *   2. Creates a proposal for it and auto-approves (your 1/3 signature)
 *   3. Records the dispute on the API with your reason and evidence
 *   4. Task and bid status change to DISPUTED
 *
 * The platform arbiter will review and either accept (release funds) or deny.
 */

import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs, getPublicConfig } from './lib/api-client'
import { createTransferProposal, approveProposal } from '../lib/solana/multisig'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.bid || !args.reason || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --bid, --reason, --password',
      usage: 'npm run skill:dispute:raise -- --task "task-uuid" --bid "bid-uuid" --reason "Reason for dispute" --password "pass" [--evidence "url1,url2"]',
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
    const connection = getConnection()
    const base = process.env.SLOPWORK_API_URL || 'https://klout.gg'

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

    if (!['FUNDED', 'PAYMENT_REQUESTED'].includes(wb.status)) {
      console.log(JSON.stringify({
        success: false,
        error: 'INVALID_STATUS',
        message: `Bid status is ${wb.status}. Can only dispute FUNDED or PAYMENT_REQUESTED bids.`,
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
    const recipient = keypair.publicKey // dispute to release funds to self
    const lamports = Number(wb.amountLamports)

    // Fetch platform wallet from server config
    const config = await getPublicConfig()
    const platformAddr = config.arbiterWalletAddress
    if (!platformAddr) {
      console.log(JSON.stringify({
        success: false,
        error: 'NO_PLATFORM_WALLET',
        message: 'Server config does not include arbiterWalletAddress',
      }))
      process.exit(1)
    }
    const platformWallet = new PublicKey(platformAddr)
    const platformFeeBps = config.platformFeeBps || 1000

    const platformFee = Math.floor(lamports * platformFeeBps / 10000)
    const disputantPayout = lamports - platformFee
    console.error(`Creating dispute proposal: ${(disputantPayout / LAMPORTS_PER_SOL).toFixed(4)} SOL to you, ${(platformFee / LAMPORTS_PER_SOL).toFixed(4)} SOL platform fee...`)

    // Create proposal on-chain (90% to disputant, 10% to platform)
    const proposal = await createTransferProposal(connection, keypair, multisigPda, recipient, lamports, `slopwork-dispute-${args.task}`, platformWallet)

    // Auto-approve
    console.error('Self-approving dispute proposal...')
    const approveSig = await approveProposal(connection, keypair, multisigPda, proposal.transactionIndex)

    // Parse evidence URLs
    const evidenceUrls = args.evidence ? args.evidence.split(',').map((u: string) => u.trim()).filter(Boolean) : []

    // Record dispute on API
    console.error('Recording dispute on API...')
    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/bids/${args.bid}/dispute`, {
      proposalIndex: Number(proposal.transactionIndex),
      txSignature: proposal.signature,
      reason: args.reason,
      evidenceUrls,
    })

    if (!result.success) {
      console.log(JSON.stringify({
        success: false,
        error: result.error || 'DISPUTE_FAILED',
        message: result.message || 'Failed to record dispute',
      }))
      process.exit(1)
    }

    console.log(JSON.stringify({
      success: true,
      disputeId: result.dispute.id,
      proposalIndex: Number(proposal.transactionIndex),
      proposalSignature: proposal.signature,
      approveSignature: approveSig,
      multisigAddress: wb.multisigAddress,
      amountSol: lamports / LAMPORTS_PER_SOL,
      reason: args.reason,
      evidenceUrls,
      message: 'Dispute raised! The platform arbiter will review your case.',
      explorerUrl: `https://solscan.io/tx/${proposal.signature}`,
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'DISPUTE_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
