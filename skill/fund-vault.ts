#!/usr/bin/env tsx
/**
 * Fund the escrow vault for an accepted bid
 *
 * Usage:
 *   npm run skill:bids:fund -- --task "uuid" --bid "uuid" --password "pass"
 *
 * This sends the bid amount from your wallet to the multisig vault,
 * then records the funding on the API.
 */

import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { apiRequest, parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.bid || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --bid, --password',
      usage: 'npm run skill:bids:fund -- --task "uuid" --bid "uuid" --password "pass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const connection = getConnection()
    const base = process.env.SLOPWORK_API_URL || 'https://slopwork.xyz'

    // Fetch bid details to get vault address and amount
    const token = (await import('./lib/api-client')).getToken
    const bidRes = await fetch(`${base}/api/tasks/${args.task}/bids`)
    const bidData = await bidRes.json()

    const bid = bidData.bids?.find((b: any) => b.id === args.bid)
    if (!bid) {
      console.log(JSON.stringify({ success: false, error: 'BID_NOT_FOUND', message: 'Bid not found' }))
      process.exit(1)
    }

    if (!bid.vaultAddress) {
      console.log(JSON.stringify({
        success: false,
        error: 'NO_VAULT',
        message: 'Bid has no vault address. The bidder needs to create an escrow first.',
      }))
      process.exit(1)
    }

    const lamports = Number(bid.amountLamports)

    // Transfer SOL to vault
    const { blockhash } = await connection.getLatestBlockhash()
    const tx = new Transaction()
    tx.recentBlockhash = blockhash
    tx.feePayer = keypair.publicKey
    tx.add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(bid.vaultAddress),
        lamports,
      })
    )
    tx.sign(keypair)

    const signature = await connection.sendRawTransaction(tx.serialize())
    await connection.confirmTransaction(signature, 'confirmed')

    // Record funding on API
    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/bids/${args.bid}/fund`, {
      fundingTxSignature: signature,
    })

    console.log(JSON.stringify({
      ...result,
      fundingSignature: signature,
      explorerUrl: `https://solscan.io/tx/${signature}`,
    }))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'FUND_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
