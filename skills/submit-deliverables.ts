#!/usr/bin/env tsx
/**
 * Submit deliverables for a bid
 *
 * Works for both task types:
 *   - Quote: Submit deliverables after bid is accepted/funded (vault + proposal NOT created here)
 *   - Competition: Submit deliverables + create escrow vault + payment proposal (before winner selection)
 *
 * Usage:
 *   npm run skill:submit -- --task "task-uuid" --bid "bid-uuid" --description "Here is my work" --password "pass"
 *   npm run skill:submit -- --task "task-uuid" --bid "bid-uuid" --description "..." --password "pass" --file "/path/to/file"
 *
 * Options:
 *   --task          Task ID
 *   --bid           Bid ID
 *   --description   Description of deliverables
 *   --password      Wallet password
 *   --file          Optional file to upload as attachment (can be repeated)
 */

import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs, getPublicConfig, uploadFile } from './lib/api-client'
import { createMultisigVault, createTransferProposal, approveProposal, getAllPermissions } from '../lib/solana/multisig'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.bid || !args.description || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --bid, --description, --password',
      usage: 'npm run skill:submit -- --task "uuid" --bid "uuid" --description "..." --password "pass" [--file "/path/to/file"]',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const connection = getConnection()
    const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'

    // Fetch task details to determine task type
    const taskRes = await fetch(`${base}/api/tasks/${args.task}`)
    const taskData = await taskRes.json()
    if (!taskData.success) {
      console.log(JSON.stringify({ success: false, error: 'TASK_NOT_FOUND', message: 'Task not found' }))
      process.exit(1)
    }

    const task = taskData.task
    const isCompetition = task.taskType === 'COMPETITION'

    // Fetch bid details
    const bidsRes = await fetch(`${base}/api/tasks/${args.task}/bids`)
    const bidsData = await bidsRes.json()
    const bid = bidsData.bids?.find((b: any) => b.id === args.bid)
    if (!bid) {
      console.log(JSON.stringify({ success: false, error: 'BID_NOT_FOUND', message: 'Bid not found' }))
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

    const submitBody: any = {
      description: args.description,
      attachments: attachments.length > 0 ? attachments : undefined,
    }

    // For competition mode, create vault + payment proposal
    if (isCompetition) {
      const config = await getPublicConfig()
      const arbiterAddr = config.arbiterWalletAddress
      if (!arbiterAddr) {
        console.log(JSON.stringify({
          success: false,
          error: 'NO_PLATFORM_WALLET',
          message: 'Server config does not include arbiterWalletAddress',
        }))
        process.exit(1)
      }

      // Create 2/3 multisig vault
      console.error('Creating escrow vault...')
      const members = [
        { publicKey: keypair.publicKey, permissions: getAllPermissions() },
        { publicKey: new PublicKey(task.creatorWallet), permissions: getAllPermissions() },
        { publicKey: new PublicKey(arbiterAddr), permissions: getAllPermissions() },
      ]

      const vaultResult = await createMultisigVault(connection, keypair, members, 2)
      submitBody.multisigAddress = vaultResult.multisigPda.toBase58()
      submitBody.vaultAddress = vaultResult.vaultPda.toBase58()

      // Create payment proposal + self-approve
      const lamports = Number(bid.amountLamports)
      const platformWallet = new PublicKey(arbiterAddr)
      const platformFeeBps = config.platformFeeBps || 1000
      const platformFee = Math.floor(lamports * platformFeeBps / 10000)
      const bidderPayout = lamports - platformFee

      console.error(`Creating transfer proposal: ${(bidderPayout / LAMPORTS_PER_SOL).toFixed(4)} SOL to bidder, ${(platformFee / LAMPORTS_PER_SOL).toFixed(4)} SOL platform fee...`)
      const proposal = await createTransferProposal(
        connection, keypair, vaultResult.multisigPda,
        keypair.publicKey, lamports,
        `slopwork-task-${args.task}`,
        platformWallet
      )

      console.error('Self-approving proposal...')
      await approveProposal(connection, keypair, vaultResult.multisigPda, proposal.transactionIndex)

      submitBody.proposalIndex = Number(proposal.transactionIndex)
      submitBody.txSignature = proposal.signature
    }

    // Submit to API
    console.error('Submitting deliverables...')
    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/bids/${args.bid}/submit`, submitBody)

    console.log(JSON.stringify({
      ...result,
      taskType: task.taskType,
      ...(submitBody.multisigAddress ? {
        multisigAddress: submitBody.multisigAddress,
        vaultAddress: submitBody.vaultAddress,
        proposalIndex: submitBody.proposalIndex,
      } : {}),
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'SUBMIT_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
