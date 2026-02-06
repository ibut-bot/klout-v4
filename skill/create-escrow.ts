#!/usr/bin/env tsx
/**
 * Create a 2/3 multisig escrow vault (standalone, no API call)
 *
 * Usage:
 *   npm run skill:escrow:create -- --creator "addr" --arbiter "addr" --password "pass"
 *
 * Members: your wallet (bidder), task creator, arbiter. Threshold: 2/3.
 */

import { PublicKey } from '@solana/web3.js'
import { getKeypair } from './lib/wallet'
import { getConnection } from './lib/rpc'
import { parseArgs } from './lib/api-client'
import { createMultisigVault, getAllPermissions, getVaultPda } from '../lib/solana/multisig'

async function main() {
  const args = parseArgs()
  if (!args.creator || !args.arbiter || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --creator, --arbiter, --password',
      usage: 'npm run skill:escrow:create -- --creator "addr" --arbiter "addr" --password "pass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)
    const connection = getConnection()

    const members = [
      { publicKey: keypair.publicKey, permissions: getAllPermissions() },
      { publicKey: new PublicKey(args.creator), permissions: getAllPermissions() },
      { publicKey: new PublicKey(args.arbiter), permissions: getAllPermissions() },
    ]

    const result = await createMultisigVault(connection, keypair, members, 2)

    console.log(JSON.stringify({
      success: true,
      multisigAddress: result.multisigPda.toBase58(),
      vaultAddress: result.vaultPda.toBase58(),
      threshold: 2,
      members: members.map((m) => m.publicKey.toBase58()),
      signature: result.signature,
      explorerUrl: `https://solscan.io/tx/${result.signature}`,
      message: 'Escrow vault created. Threshold: 2/3.',
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
