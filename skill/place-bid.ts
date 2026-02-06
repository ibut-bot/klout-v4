#!/usr/bin/env tsx
/**
 * Place a bid on a task (optionally creating a multisig escrow)
 *
 * Usage:
 *   npm run skill:bids:place -- --task "task-uuid" --amount 0.3 --description "I can do this" --password "pass"
 *   npm run skill:bids:place -- --task "task-uuid" --amount 0.3 --description "..." --password "pass" --create-escrow --creator-wallet "addr" --arbiter-wallet "addr"
 *
 * Options:
 *   --task             Task ID to bid on
 *   --amount           Bid amount in SOL
 *   --description      Bid description / proposal
 *   --password         Wallet password
 *   --create-escrow    Also create a 2/3 multisig escrow vault
 *   --creator-wallet   Task creator's wallet (required with --create-escrow)
 *   --arbiter-wallet   Arbiter wallet address (required with --create-escrow)
 */

import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs } from './lib/api-client'
import { createMultisigVault, getAllPermissions } from '../lib/solana/multisig'

async function main() {
  const args = parseArgs()

  if (!args.task || !args.amount || !args.description || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --amount, --description, --password',
      usage: 'npm run skill:bids:place -- --task "uuid" --amount 0.3 --description "..." --password "pass"',
    }))
    process.exit(1)
  }

  const amountSol = parseFloat(args.amount)
  if (isNaN(amountSol) || amountSol <= 0) {
    console.log(JSON.stringify({ success: false, error: 'INVALID_AMOUNT', message: 'Amount must be positive SOL' }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const amountLamports = Math.round(amountSol * LAMPORTS_PER_SOL)

    let multisigAddress: string | undefined
    let vaultAddress: string | undefined

    // Optionally create escrow
    if (args['create-escrow']) {
      if (!args['creator-wallet'] || !args['arbiter-wallet']) {
        console.log(JSON.stringify({
          success: false,
          error: 'MISSING_ARGS',
          message: 'With --create-escrow, also need --creator-wallet and --arbiter-wallet',
        }))
        process.exit(1)
      }

      const connection = getConnection()
      const members = [
        { publicKey: keypair.publicKey, permissions: getAllPermissions() },
        { publicKey: new PublicKey(args['creator-wallet']), permissions: getAllPermissions() },
        { publicKey: new PublicKey(args['arbiter-wallet']), permissions: getAllPermissions() },
      ]

      const result = await createMultisigVault(connection, keypair, members, 2)
      multisigAddress = result.multisigPda.toBase58()
      vaultAddress = result.vaultPda.toBase58()
    }

    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/bids`, {
      amountLamports,
      description: args.description,
      multisigAddress,
      vaultAddress,
    })

    console.log(JSON.stringify({
      ...result,
      ...(multisigAddress ? { multisigAddress, vaultAddress } : {}),
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'BID_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
