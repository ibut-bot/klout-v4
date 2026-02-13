#!/usr/bin/env tsx
/**
 * Resolve a dispute (arbiter only).
 * Can either ACCEPT (sign and execute the disputant's proposal) or DENY.
 *
 * Usage:
 *   npm run skill:dispute:resolve -- --dispute "dispute-uuid" --decision ACCEPT|DENY --password "pass" [--notes "Resolution notes"]
 *
 * What it does:
 *   For ACCEPT:
 *     1. Approves the disputant's on-chain proposal (arbiter signature = 2/3 threshold)
 *     2. Executes the vault transaction (releases funds to disputant)
 *     3. Records resolution on API, marks task/bid as COMPLETED
 *   For DENY:
 *     1. Records denial on API (no on-chain action)
 *     2. Dispute marked as DENIED, task/bid remain DISPUTED
 */

import { PublicKey } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs, getPublicConfig } from './lib/api-client'
import { approveProposal, executeVaultTransaction } from '../lib/solana/multisig'

async function main() {
  const args = parseArgs()
  if (!args.dispute || !args.decision || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --dispute, --decision (ACCEPT|DENY), --password',
      usage: 'npm run skill:dispute:resolve -- --dispute "dispute-uuid" --decision ACCEPT --password "pass" [--notes "notes"]',
    }))
    process.exit(1)
  }

  const decision = args.decision.toUpperCase()
  if (!['ACCEPT', 'DENY'].includes(decision)) {
    console.log(JSON.stringify({
      success: false,
      error: 'INVALID_DECISION',
      message: 'decision must be ACCEPT or DENY',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const connection = getConnection()
    const base = process.env.SLOPWORK_API_URL || 'https://klout.gg'

    // Verify we're the arbiter
    const config = await getPublicConfig()
    if (keypair.publicKey.toBase58() !== config.arbiterWalletAddress) {
      console.log(JSON.stringify({
        success: false,
        error: 'NOT_ARBITER',
        message: `Your wallet (${keypair.publicKey.toBase58()}) is not the arbiter wallet (${config.arbiterWalletAddress})`,
      }))
      process.exit(1)
    }

    // Fetch dispute details
    const disputeRes = await apiRequest(keypair, 'GET', `/api/disputes/${args.dispute}`)
    if (!disputeRes.success) {
      console.log(JSON.stringify({
        success: false,
        error: 'DISPUTE_NOT_FOUND',
        message: disputeRes.message || 'Failed to fetch dispute',
      }))
      process.exit(1)
    }

    const { dispute, bid } = disputeRes
    if (dispute.status !== 'PENDING') {
      console.log(JSON.stringify({
        success: false,
        error: 'ALREADY_RESOLVED',
        message: `Dispute is already ${dispute.status}`,
      }))
      process.exit(1)
    }

    let approveTxSignature = ''
    let executeTxSignature = ''

    if (decision === 'ACCEPT') {
      if (!bid.multisigAddress) {
        console.log(JSON.stringify({
          success: false,
          error: 'NO_MULTISIG',
          message: 'Bid has no multisig address',
        }))
        process.exit(1)
      }

      const multisigPda = new PublicKey(bid.multisigAddress)
      const proposalIndex = BigInt(dispute.proposalIndex)

      // Approve the proposal (arbiter = 2/3 threshold)
      console.error(`Approving dispute proposal #${dispute.proposalIndex}...`)
      approveTxSignature = await approveProposal(connection, keypair, multisigPda, proposalIndex)

      // Execute the vault transaction
      console.error('Executing vault transaction...')
      executeTxSignature = await executeVaultTransaction(connection, keypair, multisigPda, proposalIndex)
    }

    // Record resolution on API
    console.error('Recording resolution on API...')
    const result = await apiRequest(keypair, 'POST', `/api/disputes/${args.dispute}/resolve`, {
      decision,
      resolutionNotes: args.notes || undefined,
      approveTxSignature: approveTxSignature || undefined,
      executeTxSignature: executeTxSignature || undefined,
    })

    if (!result.success) {
      console.log(JSON.stringify({
        success: false,
        error: result.error || 'RESOLVE_FAILED',
        message: result.message || 'Failed to resolve dispute',
      }))
      process.exit(1)
    }

    console.log(JSON.stringify({
      success: true,
      disputeId: args.dispute,
      decision,
      approveTxSignature: approveTxSignature || null,
      executeTxSignature: executeTxSignature || null,
      message: decision === 'ACCEPT'
        ? 'Dispute accepted. Funds released to disputant.'
        : 'Dispute denied. No on-chain action taken.',
      explorerUrl: executeTxSignature ? `https://solscan.io/tx/${executeTxSignature}` : null,
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'RESOLVE_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
