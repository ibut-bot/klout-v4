#!/usr/bin/env tsx
/**
 * Create a new task on the Slopwork marketplace
 *
 * Usage:
 *   npm run skill:tasks:create -- --title "Build a landing page" --description "..." --budget 0.5 --password "mypass"
 *   npm run skill:tasks:create -- --title "Design a logo" --description "..." --budget 1.0 --type competition --password "mypass"
 *
 * Options:
 *   --title        Task title
 *   --description  Task description
 *   --budget       Budget in SOL (will be converted to lamports)
 *   --type         Task type: "quote" (default) or "competition"
 *   --password     Wallet password to sign transactions
 *   --dry-run      Validate without creating
 */

import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js'
import { PublicKey } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs, getPublicConfig } from './lib/api-client'
import { createMultisigVaultAndFund } from '../lib/solana/multisig'

async function main() {
  const args = parseArgs()

  if (!args.title || !args.description || !args.budget || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --title, --description, --budget, --password',
      usage: 'npm run skill:tasks:create -- --title "..." --description "..." --budget 0.5 --password "pass"',
    }))
    process.exit(1)
  }

  const budgetSol = parseFloat(args.budget)
  if (isNaN(budgetSol) || budgetSol <= 0) {
    console.log(JSON.stringify({
      success: false,
      error: 'INVALID_BUDGET',
      message: 'Budget must be a positive number in SOL',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const connection = getConnection()
    const budgetLamports = Math.round(budgetSol * LAMPORTS_PER_SOL)

    // Fetch server config (system wallet, fees) — no need to hardcode
    const serverConfig = await getPublicConfig()
    const SYSTEM_WALLET = process.env.SYSTEM_WALLET_ADDRESS || serverConfig.systemWalletAddress || ''
    const TASK_FEE_LAMPORTS = Number(process.env.TASK_FEE_LAMPORTS || serverConfig.taskFeeLamports || 10000000)

    if (args['dry-run']) {
      console.log(JSON.stringify({
        success: true,
        dryRun: true,
        config: {
          wallet: keypair.publicKey.toBase58(),
          title: args.title,
          budgetLamports,
          feeLamports: TASK_FEE_LAMPORTS,
          systemWallet: SYSTEM_WALLET,
          network: serverConfig.network,
        },
        message: 'Dry run passed. Remove --dry-run to create.',
      }))
      return
    }

    // Resolve task type
    const taskType = (args.type || 'quote').toUpperCase()
    if (!['QUOTE', 'COMPETITION'].includes(taskType)) {
      console.log(JSON.stringify({
        success: false,
        error: 'INVALID_TYPE',
        message: 'Task type must be "quote" or "competition"',
      }))
      process.exit(1)
    }

    let signature: string
    let vaultDetails: { multisigAddress?: string; vaultAddress?: string } = {}

    if (taskType === 'COMPETITION') {
      // Competition: create 1/1 multisig vault and fund it with budget
      console.error('Creating escrow vault and funding with budget...')
      const result = await createMultisigVaultAndFund(connection, keypair, budgetLamports)
      signature = result.signature
      vaultDetails = {
        multisigAddress: result.multisigPda.toBase58(),
        vaultAddress: result.vaultPda.toBase58(),
      }
    } else {
      // Quote: pay the task posting fee
      if (!SYSTEM_WALLET) {
        console.log(JSON.stringify({
          success: false,
          error: 'NO_SYSTEM_WALLET',
          message: 'SYSTEM_WALLET_ADDRESS not available from server config or local environment',
        }))
        process.exit(1)
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = keypair.publicKey
      tx.add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(SYSTEM_WALLET),
          lamports: TASK_FEE_LAMPORTS,
        })
      )
      tx.sign(keypair)

      signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 })
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
    }

    // Create task via API
    const result = await apiRequest(keypair, 'POST', '/api/tasks', {
      title: args.title,
      description: args.description,
      budgetLamports,
      taskType,
      paymentTxSignature: signature,
      ...vaultDetails,
    })

    const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'
    const explorerPrefix = serverConfig.explorerPrefix || 'https://solscan.io'
    console.log(JSON.stringify({
      ...result,
      paymentSignature: signature,
      explorerUrl: `${explorerPrefix}/tx/${signature}`,
      network: serverConfig.network,
      ...(result.task?.id ? { taskUrl: `${base}/tasks/${result.task.id}` } : {}),
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'CREATE_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
