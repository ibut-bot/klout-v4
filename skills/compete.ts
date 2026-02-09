#!/usr/bin/env tsx
/**
 * Submit a competition entry (bid + deliverables).
 *
 * The competition creator has already funded the escrow vault when creating the task.
 * The bid amount is automatically set to the task's budget — all participants compete
 * for the same prize. Participants pay a small entry fee (0.001 SOL) for spam prevention,
 * then submit their work description and optional file attachments.
 *
 * Usage:
 *   npm run skill:compete -- --task "task-uuid" --description "Here is my work" --password "pass"
 *   npm run skill:compete -- --task "task-uuid" --description "..." --password "pass" --file "/path/to/file"
 *
 * Options:
 *   --task          Task ID
 *   --description   Description of your completed work
 *   --password      Wallet password
 *   --file          Optional file to upload as attachment
 */

import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs, uploadFile, getPublicConfig } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.description || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --description, --password',
      usage: 'npm run skill:compete -- --task "uuid" --description "..." --password "pass" [--file "/path/to/file"]',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'

    // Fetch task details to verify it's a competition
    const taskRes = await fetch(`${base}/api/tasks/${args.task}`)
    const taskData = await taskRes.json()
    if (!taskData.success) {
      console.log(JSON.stringify({ success: false, error: 'TASK_NOT_FOUND', message: 'Task not found' }))
      process.exit(1)
    }
    const task = taskData.task
    if (task.taskType !== 'COMPETITION') {
      console.log(JSON.stringify({
        success: false,
        error: 'WRONG_TASK_TYPE',
        message: 'This script is for COMPETITION tasks. Use skill:bids:place + skill:submit for QUOTE tasks.',
      }))
      process.exit(1)
    }

    // Upload file if provided
    let attachments: any[] = []
    if (args.file) {
      console.error('Uploading file...')
      const uploadResult = await uploadFile(keypair, args.file)
      if (uploadResult.success) {
        const path = await import('path')
        attachments.push({
          url: uploadResult.url,
          key: uploadResult.key,
          contentType: uploadResult.contentType,
          size: uploadResult.size,
          filename: path.basename(args.file),
        })
      } else {
        console.error('Warning: File upload failed, proceeding without attachment')
      }
    }

    // Pay entry fee (spam prevention)
    const serverConfig = await getPublicConfig()
    const SYSTEM_WALLET = process.env.SYSTEM_WALLET_ADDRESS || serverConfig.systemWalletAddress || ''
    const ENTRY_FEE = Number(serverConfig.competitionEntryFeeLamports || 1000000) // 0.001 SOL default

    if (!SYSTEM_WALLET) {
      console.log(JSON.stringify({
        success: false,
        error: 'NO_SYSTEM_WALLET',
        message: 'SYSTEM_WALLET_ADDRESS not available from server config or local environment',
      }))
      process.exit(1)
    }

    console.error(`Paying entry fee of ${(ENTRY_FEE / LAMPORTS_PER_SOL).toFixed(3)} SOL...`)
    const connection = getConnection()
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const tx = new Transaction()
    tx.recentBlockhash = blockhash
    tx.feePayer = keypair.publicKey
    tx.add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(SYSTEM_WALLET),
        lamports: ENTRY_FEE,
      })
    )
    tx.sign(keypair)
    const feeSig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 })
    await connection.confirmTransaction({ signature: feeSig, blockhash, lastValidBlockHeight }, 'confirmed')

    // Submit competition entry with fee signature
    console.error('Submitting competition entry...')
    const apiResult = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/compete`, {
      description: args.description,
      attachments: attachments.length > 0 ? attachments : undefined,
      entryFeeTxSignature: feeSig,
    })

    console.log(JSON.stringify(apiResult))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'COMPETE_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
