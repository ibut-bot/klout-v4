import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getConnection } from './connection'

export interface TxVerification {
  valid: boolean
  from?: string
  to?: string
  lamports?: number
  error?: string
}

/**
 * Verify a SOL transfer transaction on-chain.
 * Checks that the tx exists, is confirmed, and transfers at least `minLamports`
 * to the expected recipient.
 */
export async function verifyPaymentTx(
  txSignature: string,
  expectedRecipient: string,
  minLamports: number
): Promise<TxVerification> {
  try {
    const connection = getConnection()
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    })

    if (!tx) {
      return { valid: false, error: 'Transaction not found or not confirmed' }
    }

    if (tx.meta?.err) {
      return { valid: false, error: 'Transaction failed on-chain' }
    }

    // Look through instructions for a SOL transfer to the expected recipient
    for (const ix of tx.transaction.message.instructions) {
      if ('parsed' in ix && ix.program === 'system' && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info
        if (
          info.destination === expectedRecipient &&
          info.lamports >= minLamports
        ) {
          return {
            valid: true,
            from: info.source,
            to: info.destination,
            lamports: info.lamports,
          }
        }
      }
    }

    return { valid: false, error: 'No matching transfer found in transaction' }
  } catch (e: any) {
    return { valid: false, error: e.message || 'Failed to verify transaction' }
  }
}

/**
 * Verify that a funding transaction actually sent SOL to a vault address.
 */
export async function verifyFundingTx(
  txSignature: string,
  vaultAddress: string,
  expectedLamports: number
): Promise<TxVerification> {
  return verifyPaymentTx(txSignature, vaultAddress, expectedLamports)
}
