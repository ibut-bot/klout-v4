#!/usr/bin/env tsx
/**
 * Edit a campaign task on the Klout marketplace
 *
 * Usage:
 *   npm run skill:tasks:edit -- --task "TASK_ID" --description "New description" --password "pass"
 *   npm run skill:tasks:edit -- --task "TASK_ID" --dos "Include link,Mention product" --donts "No spam" --password "pass"
 *   npm run skill:tasks:edit -- --task "TASK_ID" --deadline "2026-03-01T00:00:00Z" --password "pass"
 *   npm run skill:tasks:edit -- --task "TASK_ID" --budget 3.0 --password "pass"  # Increase budget (sends SOL/USDC diff to vault)
 *   npm run skill:tasks:edit -- --task "TASK_ID" --heading "New card headline" --min-likes 10 --password "pass"
 *   npm run skill:tasks:edit -- --task "TASK_ID" --collateral-link "https://drive.google.com/..." --password "pass"
 *
 * Options:
 *   --task             Task ID to edit
 *   --description      New description
 *   --heading          New card heading (campaign only)
 *   --collateral-link  Link to Google Drive/Dropbox with collateral for creators (campaign only, use "null" to remove)
 *   --dos              Comma-separated dos guidelines
 *   --donts            Comma-separated donts guidelines
 *   --min-views        Minimum views threshold (campaign only)
 *   --min-likes        Minimum likes threshold (campaign only)
 *   --min-retweets     Minimum retweets threshold (campaign only)
 *   --min-comments     Minimum comments threshold (campaign only)
 *   --min-klout        Minimum Klout score required to participate (campaign only, use "null" to remove)
 *   --deadline         New deadline (ISO date string, must be in the future; use "null" to remove)
 *   --budget           New budget in SOL or USDC (must be greater than current — increase only, token auto-detected from task)
 *   --password         Wallet password for authentication
 */

import { LAMPORTS_PER_SOL, SystemProgram, Transaction, PublicKey } from '@solana/web3.js'
import { createTransferInstruction } from '@solana/spl-token'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs } from './lib/api-client'
import { getAta, USDC_MINT } from '../lib/solana/spl-token'
import { type PaymentTokenType, resolveTokenInfo } from '../lib/token-utils'

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

  if (!args.description && !args.heading && !args.dos && !args.donts && !args.deadline && !args.budget && args['collateral-link'] === undefined && args['min-views'] === undefined && args['min-likes'] === undefined && args['min-retweets'] === undefined && args['min-comments'] === undefined && args['min-klout'] === undefined && args['follow-x'] === undefined) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'At least one edit field required: --description, --heading, --collateral-link, --dos, --donts, --deadline, --budget, --min-views, --min-likes, --min-retweets, --min-comments, --min-klout, --follow-x',
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

    if (args.heading !== undefined) {
      updates.heading = args.heading || null
    }

    if (args['collateral-link'] !== undefined) {
      updates.collateralLink = args['collateral-link'] === 'null' ? null : args['collateral-link']
    }

    if (args['min-views'] !== undefined) updates.minViews = parseInt(args['min-views'])
    if (args['min-likes'] !== undefined) updates.minLikes = parseInt(args['min-likes'])
    if (args['min-retweets'] !== undefined) updates.minRetweets = parseInt(args['min-retweets'])
    if (args['min-comments'] !== undefined) updates.minComments = parseInt(args['min-comments'])
    if (args['min-klout'] !== undefined) updates.minKloutScore = args['min-klout'] === 'null' ? null : parseInt(args['min-klout'])
    if (args['follow-x'] !== undefined) updates.requireFollowX = args['follow-x'] === 'null' ? null : args['follow-x'].replace(/^@/, '')

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
      const newBudgetNum = parseFloat(args.budget)
      if (isNaN(newBudgetNum) || newBudgetNum <= 0) {
        console.log(JSON.stringify({
          success: false,
          error: 'INVALID_BUDGET',
          message: 'Budget must be a positive number',
        }))
        process.exit(1)
      }

      // Fetch current task to get current budget, vault address, and payment token
      console.error('Fetching current task details for budget increase...')
      const taskData = await apiRequest(keypair, 'GET', `/api/tasks/${args.task}`)
      if (!taskData.success) throw new Error(taskData.message || 'Failed to fetch task')

      const pt: PaymentTokenType = (taskData.task.paymentToken as PaymentTokenType) || 'SOL'
      const tInfo = resolveTokenInfo(pt, taskData.task.customTokenMint, taskData.task.customTokenSymbol, taskData.task.customTokenDecimals)
      const sym = tInfo.symbol
      const mult = tInfo.multiplier
      const newBudgetBaseUnits = Math.round(newBudgetNum * mult)

      const currentBudget = Number(taskData.task.budgetLamports)
      if (newBudgetBaseUnits <= currentBudget) {
        console.log(JSON.stringify({
          success: false,
          error: 'BUDGET_DECREASE_NOT_ALLOWED',
          message: `New budget (${newBudgetNum} ${sym}) must be greater than current budget (${currentBudget / mult} ${sym})`,
        }))
        process.exit(1)
      }

      const vaultAddress = taskData.task.vaultAddress
      if (!vaultAddress) throw new Error('Task has no vault address')

      const difference = newBudgetBaseUnits - currentBudget
      console.error(`Sending ${difference / mult} ${sym} budget increase to vault ${vaultAddress}...`)

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = keypair.publicKey

      if (pt === 'SOL') {
        // SOL: native transfer
        tx.add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: new PublicKey(vaultAddress),
            lamports: difference,
          })
        )
      } else {
        // USDC or CUSTOM: SPL token transfer to vault's ATA
        const mint = pt === 'CUSTOM' && taskData.task.customTokenMint
          ? new PublicKey(taskData.task.customTokenMint)
          : USDC_MINT
        const vaultPda = new PublicKey(vaultAddress)
        const creatorAta = getAta(keypair.publicKey, mint)
        const vaultAta = getAta(vaultPda, mint)
        tx.add(createTransferInstruction(creatorAta, vaultAta, keypair.publicKey, difference))
      }
      tx.sign(keypair)

      const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 })
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
      console.error(`Budget increase tx confirmed: ${sig}`)

      updates.budgetLamports = newBudgetBaseUnits
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
