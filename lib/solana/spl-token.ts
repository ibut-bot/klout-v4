/**
 * SPL Token (USDC) utilities for Squads Multisig vault operations.
 *
 * Mirrors the SOL-based functions in multisig.ts but uses SPL token
 * transfers instead of SystemProgram.transfer.
 */

import * as multisig from '@sqds/multisig'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  SystemProgram,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token'
import {
  getProgramConfigPda,
  getVaultPda,
  splitPayment,
  type WalletSigner,
} from './multisig'
import { getConnection } from './connection'

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || USDC_MINT_MAINNET
)

export const USDC_DECIMALS = 6

const { Permissions } = multisig.types

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Get the Associated Token Account address for a wallet + mint. */
export function getAta(owner: PublicKey, mint: PublicKey = USDC_MINT): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true) // allowOwnerOffCurve = true for PDAs
}

/**
 * Build an instruction to create an ATA if it doesn't exist.
 * Returns null if the ATA already exists.
 */
async function createAtaIfNeeded(
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey = USDC_MINT,
): Promise<{ ata: PublicKey; instruction: ReturnType<typeof createAssociatedTokenAccountInstruction> | null }> {
  const ata = getAta(owner, mint)
  try {
    await getAccount(connection, ata)
    return { ata, instruction: null } // already exists
  } catch {
    return {
      ata,
      instruction: createAssociatedTokenAccountInstruction(payer, ata, owner, mint),
    }
  }
}

// ──────────────────────────────────────────────
// Vault Creation + USDC Funding (WalletAdapter)
// ──────────────────────────────────────────────

/**
 * Create a 1/1 multisig vault and fund it with USDC -- all in one transaction.
 * Steps:
 * 1. Create 1/1 multisig (creator only)
 * 2. Create ATA for vault PDA (owned by vault PDA)
 * 3. Transfer USDC from creator → vault ATA
 */
export async function createMultisigVaultAndFundUsdcWA(
  connection: Connection,
  wallet: WalletSigner,
  budgetBaseUnits: number,
): Promise<{ multisigPda: PublicKey; vaultPda: PublicKey; signature: string }> {
  const createKey = Keypair.generate()
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const programConfigPda = getProgramConfigPda()
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)

  // 1. Create 1/1 multisig
  const createMultisigIx = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: wallet.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock: 0,
    members: [{ key: wallet.publicKey, permissions: Permissions.all() }],
    threshold: 1,
    treasury: programConfig.treasury,
    rentCollector: null,
  })

  // 2. Create ATA for vault PDA
  const vaultAta = getAta(vaultPda)
  const createVaultAtaIx = createAssociatedTokenAccountInstruction(
    wallet.publicKey, // payer
    vaultAta,
    vaultPda,         // owner
    USDC_MINT,
  )

  // 3. Transfer USDC from creator to vault ATA
  const creatorAta = getAta(wallet.publicKey)
  const transferIx = createTransferInstruction(
    creatorAta,       // source
    vaultAta,         // destination
    wallet.publicKey, // authority
    budgetBaseUnits,
  )

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  tx.add(createMultisigIx, createVaultAtaIx, transferIx)

  const signedTx = await wallet.signTransaction(tx)
  signedTx.partialSign(createKey)

  const signature = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  return { multisigPda, vaultPda, signature }
}

// ──────────────────────────────────────────────
// Vault Creation + USDC Funding (Keypair -- CLI)
// ──────────────────────────────────────────────

/**
 * Keypair-based variant of createMultisigVaultAndFundUsdcWA for CLI scripts.
 */
export async function createMultisigVaultAndFundUsdc(
  connection: Connection,
  creator: Keypair,
  budgetBaseUnits: number,
): Promise<{ multisigPda: PublicKey; vaultPda: PublicKey; signature: string }> {
  const createKey = Keypair.generate()
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const programConfigPda = getProgramConfigPda()
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)

  const createMultisigIx = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: creator.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock: 0,
    members: [{ key: creator.publicKey, permissions: Permissions.all() }],
    threshold: 1,
    treasury: programConfig.treasury,
    rentCollector: null,
  })

  const vaultAta = getAta(vaultPda)
  const createVaultAtaIx = createAssociatedTokenAccountInstruction(
    creator.publicKey, vaultAta, vaultPda, USDC_MINT,
  )

  const creatorAta = getAta(creator.publicKey)
  const transferIx = createTransferInstruction(
    creatorAta, vaultAta, creator.publicKey, budgetBaseUnits,
  )

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = creator.publicKey
  tx.add(createMultisigIx, createVaultAtaIx, transferIx)
  tx.sign(creator, createKey)

  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  return { multisigPda, vaultPda, signature }
}

// ──────────────────────────────────────────────
// USDC Payout: Proposal + Approve + Execute (WA)
// ──────────────────────────────────────────────

/**
 * Create proposal + approve + execute for a USDC payout from vault.
 * 90% goes to recipient, 10% to platform wallet — as SPL token transfers.
 *
 * Before calling, ensure recipient & platform ATAs exist (they are created
 * in the inner vault transaction if needed, or pre-created by the caller).
 */
export async function createProposalApproveExecuteUsdcWA(
  connection: Connection,
  wallet: WalletSigner,
  multisigPda: PublicKey,
  recipient: PublicKey,
  totalBaseUnits: number,
  platformWallet?: PublicKey,
  memo?: string,
): Promise<{ transactionIndex: bigint; signature: string }> {
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1)
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const { recipientAmount, platformAmount } = splitPayment(totalBaseUnits, platformWallet ? platformWallet : undefined)

  const vaultAta = getAta(vaultPda)
  const recipientAta = getAta(recipient)

  // Pre-create recipient ATA if needed (outside the vault transaction)
  const preInstructions: ReturnType<typeof createAssociatedTokenAccountInstruction>[] = []

  const recipientAtaInfo = await createAtaIfNeeded(connection, wallet.publicKey, recipient)
  if (recipientAtaInfo.instruction) {
    preInstructions.push(recipientAtaInfo.instruction)
  }

  let platformAta: PublicKey | null = null
  if (platformWallet && platformAmount > 0) {
    platformAta = getAta(platformWallet)
    const platformAtaInfo = await createAtaIfNeeded(connection, wallet.publicKey, platformWallet)
    if (platformAtaInfo.instruction) {
      preInstructions.push(platformAtaInfo.instruction)
    }
  }

  // Inner vault transaction instructions: SPL token transfers from vault ATA
  const innerInstructions = [
    createTransferInstruction(
      vaultAta,  // source
      recipientAta, // dest
      vaultPda,  // authority (PDA — program signs)
      recipientAmount,
    ),
  ]

  if (platformAta && platformAmount > 0) {
    innerInstructions.push(
      createTransferInstruction(
        vaultAta,
        platformAta,
        vaultPda,
        platformAmount,
      ),
    )
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const transferMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: innerInstructions,
  })

  // 1. Create vault transaction
  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: wallet.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: transferMessage,
    memo,
  })

  // 2. Create proposal
  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: wallet.publicKey,
  })

  // 3. Approve
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: wallet.publicKey,
  })

  // 4. Execute
  const [transactionPda] = multisig.getTransactionPda({ multisigPda, index: transactionIndex })
  const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex })

  // Remaining accounts mirror the compiled inner message keys:
  //   vaultPda (signer in inner msg → isSigner: false, PDA signing)
  //   vaultAta (writable)
  //   recipientAta (writable)
  //   platformAta (writable, if present)
  //   TOKEN_PROGRAM_ID (read-only)
  const anchorRemainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: vaultAta, isSigner: false, isWritable: true },
    { pubkey: recipientAta, isSigner: false, isWritable: true },
  ]
  if (platformAta && platformAmount > 0) {
    anchorRemainingAccounts.push({ pubkey: platformAta, isSigner: false, isWritable: true })
  }
  anchorRemainingAccounts.push({ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false })

  const executeIx = multisig.generated.createVaultTransactionExecuteInstruction({
    multisig: multisigPda,
    transaction: transactionPda,
    proposal: proposalPda,
    member: wallet.publicKey,
    anchorRemainingAccounts,
  })

  // Bundle everything into one transaction
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  // Pre-instructions: create ATAs that don't exist yet
  for (const ix of preInstructions) {
    tx.add(ix)
  }
  tx.add(createVaultTxIx, createProposalIx, approveIx, executeIx)

  const signedTx = await wallet.signTransaction(tx)
  const sig = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')

  return { transactionIndex, signature: sig }
}

// ──────────────────────────────────────────────
// Read Helpers
// ──────────────────────────────────────────────

/** Get the USDC balance of a vault PDA's ATA. */
export async function getVaultUsdcBalance(
  connection: Connection,
  multisigPda: PublicKey,
): Promise<{ usdcBalance: number; vaultAta: string }> {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })
  const vaultAta = getAta(vaultPda)
  try {
    const account = await getAccount(connection, vaultAta)
    return {
      usdcBalance: Number(account.amount) / 10 ** USDC_DECIMALS,
      vaultAta: vaultAta.toBase58(),
    }
  } catch {
    return { usdcBalance: 0, vaultAta: vaultAta.toBase58() }
  }
}

// ──────────────────────────────────────────────
// Transaction Verification
// ──────────────────────────────────────────────

export interface TokenTxVerification {
  valid: boolean
  from?: string
  to?: string
  amount?: number
  error?: string
}

/**
 * Verify a USDC (SPL token) transfer transaction on-chain.
 * Checks that the tx exists, is confirmed, and transfers at least `minAmount`
 * base-units of the given mint to an ATA owned by the expected recipient.
 */
export async function verifyUsdcTransferTx(
  txSignature: string,
  expectedRecipient: string,
  minAmount: number,
  mint: PublicKey = USDC_MINT,
): Promise<TokenTxVerification> {
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

    // The expected recipient ATA
    const expectedAta = getAta(new PublicKey(expectedRecipient), mint).toBase58()

    // Look for spl-token transfer or transferChecked instructions
    for (const ix of tx.transaction.message.instructions) {
      if ('parsed' in ix && ix.program === 'spl-token') {
        const parsed = ix.parsed
        if (
          (parsed?.type === 'transfer' || parsed?.type === 'transferChecked') &&
          parsed.info
        ) {
          const dest = parsed.info.destination
          const amount = parsed.type === 'transferChecked'
            ? Number(parsed.info.tokenAmount?.amount || 0)
            : Number(parsed.info.amount || 0)

          if (dest === expectedAta && amount >= minAmount) {
            return {
              valid: true,
              from: parsed.info.source,
              to: dest,
              amount,
            }
          }
        }
      }
    }

    // Also check inner instructions (vault transactions have inner ixs)
    if (tx.meta?.innerInstructions) {
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          if ('parsed' in ix && ix.program === 'spl-token') {
            const parsed = ix.parsed
            if (
              (parsed?.type === 'transfer' || parsed?.type === 'transferChecked') &&
              parsed.info
            ) {
              const dest = parsed.info.destination
              const amount = parsed.type === 'transferChecked'
                ? Number(parsed.info.tokenAmount?.amount || 0)
                : Number(parsed.info.amount || 0)

              if (dest === expectedAta && amount >= minAmount) {
                return {
                  valid: true,
                  from: parsed.info.source,
                  to: dest,
                  amount,
                }
              }
            }
          }
        }
      }
    }

    return { valid: false, error: 'No matching USDC transfer found in transaction' }
  } catch (e: any) {
    return { valid: false, error: e.message || 'Failed to verify transaction' }
  }
}

/**
 * Verify that a funding transaction sent USDC to a vault's ATA.
 */
export async function verifyUsdcFundingTx(
  txSignature: string,
  vaultAddress: string,
  expectedBaseUnits: number,
): Promise<TokenTxVerification> {
  return verifyUsdcTransferTx(txSignature, vaultAddress, expectedBaseUnits)
}
