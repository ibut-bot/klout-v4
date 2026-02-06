#!/usr/bin/env tsx
/**
 * Execute an already-approved vault transaction (standalone).
 * Use this if approve and execute need to happen as separate steps,
 * e.g., when an arbiter approved instead of the task creator.
 *
 * Usage:
 *   npm run skill:escrow:execute -- --vault "multisigAddr" --proposal 1 --password "pass"
 *
 * For the normal flow (task creator approves + executes + records),
 * use skill:escrow:approve instead.
 */

import { PublicKey } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { parseArgs } from './lib/api-client'
import { executeVaultTransaction, getProposalStatus } from '../lib/solana/multisig'

async function main() {
  const args = parseArgs()
  if (!args.vault || !args.proposal || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --vault, --proposal, --password',
      usage: 'npm run skill:escrow:execute -- --vault "addr" --proposal 1 --password "pass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const connection = getConnection()
    const multisigPda = new PublicKey(args.vault)
    const proposalIndex = BigInt(args.proposal)

    const proposal = await getProposalStatus(connection, multisigPda, proposalIndex)
    if (!proposal) {
      console.log(JSON.stringify({ success: false, error: 'PROPOSAL_NOT_FOUND', message: `Proposal #${args.proposal} not found` }))
      process.exit(1)
    }
    if (proposal.status !== 'Approved') {
      console.log(JSON.stringify({
        success: false,
        error: 'NOT_APPROVED',
        message: `Proposal is ${proposal.status}, must be Approved to execute`,
        currentApprovals: proposal.approvals.length,
      }))
      process.exit(1)
    }

    const signature = await executeVaultTransaction(connection, keypair, multisigPda, proposalIndex)
    const updated = await getProposalStatus(connection, multisigPda, proposalIndex)

    console.log(JSON.stringify({
      success: true,
      proposalIndex: args.proposal,
      newStatus: updated?.status,
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
      message: 'Payment executed successfully! If this was for a slopwork task, also call the approve-payment API.',
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'EXECUTE_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
