#!/usr/bin/env tsx
/**
 * Edit a campaign task on the Klout marketplace
 *
 * Usage:
 *   npm run skill:tasks:edit -- --task "TASK_ID" --description "New description" --password "pass"
 *   npm run skill:tasks:edit -- --task "TASK_ID" --dos "Include link,Mention product" --donts "No spam" --password "pass"
 *   npm run skill:tasks:edit -- --task "TASK_ID" --deadline "2026-03-01T00:00:00Z" --password "pass"
 *   npm run skill:tasks:edit -- --task "TASK_ID" --budget 3.0 --password "pass"  # Increase budget (sends SOL diff to vault)
 *
 * Options:
 *   --task         Task ID to edit
 *   --description  New description
 *   --dos          Comma-separated dos guidelines
 *   --donts        Comma-separated donts guidelines
 *   --deadline     New deadline (ISO date string, must be in the future; use "null" to remove)
 *   --budget       New budget in SOL (must be greater than current — increase only)
 *   --password     Wallet password for authentication
 */

import { LAMPORTS_PER_SOL, SystemProgram, Transaction, PublicKey } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()

  if (!args.task || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --password',
      usage: 'npm run skill:tasks:edit -- --task "TASK_ID" --password "pass" [--description "..."] [--dos "a,b"] [--donts "x,y"] [--deadline "ISO_DATE"] [--budget SOL]',
    }))
    process.exit(1)
  }

  if (!args.description && !args.dos && !args.donts && !args.deadline && !args.budget) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'At least one edit field required: --description, --dos, --donts, --deadline, --budget',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const connection = getConnection()

    // Build the update payload
    const updates: any = {}

    if (args.description) {
      updates.description = args.description
    }

    if (args.dos || args.donts) {
      const dos = args.dos ? args.dos.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined
      const donts = args.donts ? args.donts.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined

      // If only updating one, we need to fetch current guidelines for the other
      if ((dos && !donts) || (!dos && donts)) {
        console.error('Fetching current task details...')
        const taskData = await apiRequest(keypair, 'GET', `/api/tasks/${args.task}`)
        if (!taskData.success) throw new Error(taskData.message || 'Failed to fetch task')
        const currentGuidelines = taskData.task?.campaignConfig?.guidelines || { dos: [], donts: [] }
        updates.guidelines = {
          dos: dos || currentGuidelines.dos,
          donts: donts || currentGuidelines.donts,
        }
      } else {
        updates.guidelines = { dos: dos || [], donts: donts || [] }
      }
    }

    if (args.deadline) {
      updates.deadlineAt = args.deadline === 'null' ? null : args.deadline
    }

    // Budget increase
    if (args.budget) {
      const newBudgetSol = parseFloat(args.budget)
      if (isNaN(newBudgetSol) || newBudgetSol <= 0) {
        console.log(JSON.stringify({
          success: false,
          error: 'INVALID_BUDGET',
          message: 'Budget must be a positive number in SOL',
        }))
        process.exit(1)
      }

      const newBudgetLamports = Math.round(newBudgetSol * LAMPORTS_PER_SOL)

      // Fetch current task to get current budget and vault address
      console.error('Fetching current task details for budget increase...')
      const taskData = await apiRequest(keypair, 'GET', `/api/tasks/${args.task}`)
      if (!taskData.success) throw new Error(taskData.message || 'Failed to fetch task')

      const currentBudget = Number(taskData.task.budgetLamports)
      if (newBudgetLamports <= currentBudget) {
        console.log(JSON.stringify({
          success: false,
          error: 'BUDGET_DECREASE_NOT_ALLOWED',
          message: `New budget (${newBudgetSol} SOL) must be greater than current budget (${currentBudget / LAMPORTS_PER_SOL} SOL)`,
        }))
        process.exit(1)
      }

      const vaultAddress = taskData.task.vaultAddress
      if (!vaultAddress) throw new Error('Task has no vault address')

      const difference = newBudgetLamports - currentBudget
      console.error(`Sending ${difference / LAMPORTS_PER_SOL} SOL budget increase to vault ${vaultAddress}...`)

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = keypair.publicKey
      tx.add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(vaultAddress),
          lamports: difference,
        })
      )
      tx.sign(keypair)

      const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 })
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
      console.error(`Budget increase tx confirmed: ${sig}`)

      updates.budgetLamports = newBudgetLamports
      updates.budgetIncreaseTxSignature = sig
    }

    // Submit the update
    console.error(`Updating task ${args.task}...`)
    const result = await apiRequest(keypair, 'PATCH', `/api/tasks/${args.task}`, updates)

    console.log(JSON.stringify(result, null, 2))
    process.exit(result.success ? 0 : 1)
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'EDIT_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
