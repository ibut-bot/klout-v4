/**
 * Generic SPL Token utilities for Squads Multisig vault operations.
 *
 * All functions accept a `mint` parameter so they work with USDC, BONK,
 * or any other SPL token.  Legacy USDC-named exports are thin wrappers.
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
  return getAssociatedTokenAddressSync(mint, owner, true)
}

/**
 * Build an instruction to create an ATA if it doesn't exist.
 * Returns null instruction if the ATA already exists.
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
    return { ata, instruction: null }
  } catch {
    return {
      ata,
      instruction: createAssociatedTokenAccountInstruction(payer, ata, owner, mint),
    }
  }
}

// ──────────────────────────────────────────────
// Generic SPL Vault Creation + Funding (WalletAdapter)
// ──────────────────────────────────────────────

/**
 * Create a 1/1 multisig vault and fund it with any SPL token.
 */
export async function createMultisigVaultAndFundSplWA(
  connection: Connection,
  wallet: WalletSigner,
  budgetBaseUnits: number,
  mint: PublicKey = USDC_MINT,
  extraInstructions: Parameters<Transaction['add']>[0][] = [],
): Promise<{ multisigPda: PublicKey; vaultPda: PublicKey; signature: string }> {
  const createKey = Keypair.generate()
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const programConfigPda = getProgramConfigPda()
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)

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

  const vaultAta = getAta(vaultPda, mint)
  const createVaultAtaIx = createAssociatedTokenAccountInstruction(
    wallet.publicKey, vaultAta, vaultPda, mint,
  )

  const creatorAta = getAta(wallet.publicKey, mint)
  const transferIx = createTransferInstruction(
    creatorAta, vaultAta, wallet.publicKey, budgetBaseUnits,
  )

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  tx.add(createMultisigIx, createVaultAtaIx, transferIx, ...extraInstructions)

  const signedTx = await wallet.signTransaction(tx)
  signedTx.partialSign(createKey)

  const signature = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  return { multisigPda, vaultPda, signature }
}

// ──────────────────────────────────────────────
// Generic SPL Vault Creation + Funding (Keypair -- CLI)
// ──────────────────────────────────────────────

/**
 * Keypair-based variant for CLI scripts.
 */
export async function createMultisigVaultAndFundSpl(
  connection: Connection,
  creator: Keypair,
  budgetBaseUnits: number,
  mint: PublicKey = USDC_MINT,
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

  const vaultAta = getAta(vaultPda, mint)
  const createVaultAtaIx = createAssociatedTokenAccountInstruction(
    creator.publicKey, vaultAta, vaultPda, mint,
  )

  const creatorAta = getAta(creator.publicKey, mint)
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
// Generic SPL Payout: Proposal + Approve + Execute (WA)
// ──────────────────────────────────────────────

/**
 * Create proposal + approve + execute for an SPL token payout from vault.
 * 90% goes to recipient, 10% to platform wallet.
 */
export async function createProposalApproveExecuteSplWA(
  connection: Connection,
  wallet: WalletSigner,
  multisigPda: PublicKey,
  recipient: PublicKey,
  totalBaseUnits: number,
  platformWallet?: PublicKey,
  memo?: string,
  mint: PublicKey = USDC_MINT,
  referrerWallet?: PublicKey,
  referrerFeePct: number = 0,
): Promise<{ transactionIndex: bigint; signature: string }> {
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1)
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const { recipientAmount, platformAmount, referrerAmount } = splitPayment(totalBaseUnits, platformWallet ? platformWallet : undefined, referrerFeePct)

  const vaultAta = getAta(vaultPda, mint)
  const recipientAta = getAta(recipient, mint)

  const preInstructions: ReturnType<typeof createAssociatedTokenAccountInstruction>[] = []

  const recipientAtaInfo = await createAtaIfNeeded(connection, wallet.publicKey, recipient, mint)
  if (recipientAtaInfo.instruction) {
    preInstructions.push(recipientAtaInfo.instruction)
  }

  let platformAta: PublicKey | null = null
  if (platformWallet && platformAmount > 0) {
    platformAta = getAta(platformWallet, mint)
    const platformAtaInfo = await createAtaIfNeeded(connection, wallet.publicKey, platformWallet, mint)
    if (platformAtaInfo.instruction) {
      preInstructions.push(platformAtaInfo.instruction)
    }
  }

  let referrerAta: PublicKey | null = null
  if (referrerWallet && referrerAmount > 0) {
    referrerAta = getAta(referrerWallet, mint)
    const referrerAtaInfo = await createAtaIfNeeded(connection, wallet.publicKey, referrerWallet, mint)
    if (referrerAtaInfo.instruction) {
      preInstructions.push(referrerAtaInfo.instruction)
    }
  }

  const innerInstructions = [
    createTransferInstruction(vaultAta, recipientAta, vaultPda, recipientAmount),
  ]

  if (platformAta && platformAmount > 0) {
    innerInstructions.push(
      createTransferInstruction(vaultAta, platformAta, vaultPda, platformAmount),
    )
  }

  if (referrerAta && referrerAmount > 0) {
    innerInstructions.push(
      createTransferInstruction(vaultAta, referrerAta, vaultPda, referrerAmount),
    )
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const transferMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: innerInstructions,
  })

  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: wallet.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: transferMessage,
    memo,
  })

  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: wallet.publicKey,
  })

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: wallet.publicKey,
  })

  const [transactionPda] = multisig.getTransactionPda({ multisigPda, index: transactionIndex })
  const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex })

  const anchorRemainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: vaultAta, isSigner: false, isWritable: true },
    { pubkey: recipientAta, isSigner: false, isWritable: true },
  ]
  if (platformAta && platformAmount > 0) {
    anchorRemainingAccounts.push({ pubkey: platformAta, isSigner: false, isWritable: true })
  }
  if (referrerAta && referrerAmount > 0) {
    anchorRemainingAccounts.push({ pubkey: referrerAta, isSigner: false, isWritable: true })
  }
  anchorRemainingAccounts.push({ pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false })

  const executeIx = multisig.generated.createVaultTransactionExecuteInstruction({
    multisig: multisigPda,
    transaction: transactionPda,
    proposal: proposalPda,
    member: wallet.publicKey,
    anchorRemainingAccounts,
  })

  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
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

/** Get the SPL token balance of a vault PDA's ATA. */
export async function getVaultSplBalance(
  connection: Connection,
  multisigPda: PublicKey,
  mint: PublicKey = USDC_MINT,
  decimals: number = USDC_DECIMALS,
): Promise<{ balance: number; vaultAta: string }> {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })
  const vaultAta = getAta(vaultPda, mint)
  try {
    const account = await getAccount(connection, vaultAta)
    return {
      balance: Number(account.amount) / 10 ** decimals,
      vaultAta: vaultAta.toBase58(),
    }
  } catch {
    return { balance: 0, vaultAta: vaultAta.toBase58() }
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
 * Verify an SPL token transfer transaction on-chain.
 */
export async function verifySplTransferTx(
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

    const expectedAta = getAta(new PublicKey(expectedRecipient), mint).toBase58()

    const checkIx = (ix: any): TokenTxVerification | null => {
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
            return { valid: true, from: parsed.info.source, to: dest, amount }
          }
        }
      }
      return null
    }

    for (const ix of tx.transaction.message.instructions) {
      const result = checkIx(ix)
      if (result) return result
    }

    if (tx.meta?.innerInstructions) {
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          const result = checkIx(ix)
          if (result) return result
        }
      }
    }

    return { valid: false, error: 'No matching SPL token transfer found in transaction' }
  } catch (e: any) {
    return { valid: false, error: e.message || 'Failed to verify transaction' }
  }
}

/**
 * Verify that a funding transaction sent SPL tokens to a vault's ATA.
 */
export async function verifySplFundingTx(
  txSignature: string,
  vaultAddress: string,
  expectedBaseUnits: number,
  mint: PublicKey = USDC_MINT,
): Promise<TokenTxVerification> {
  return verifySplTransferTx(txSignature, vaultAddress, expectedBaseUnits, mint)
}

// ──────────────────────────────────────────────
// Legacy USDC-named wrappers (backward compat)
// ──────────────────────────────────────────────

export const createMultisigVaultAndFundUsdcWA = (
  connection: Connection, wallet: WalletSigner, budgetBaseUnits: number,
) => createMultisigVaultAndFundSplWA(connection, wallet, budgetBaseUnits, USDC_MINT)

export const createMultisigVaultAndFundUsdc = (
  connection: Connection, creator: Keypair, budgetBaseUnits: number,
) => createMultisigVaultAndFundSpl(connection, creator, budgetBaseUnits, USDC_MINT)

export const createProposalApproveExecuteUsdcWA = (
  connection: Connection, wallet: WalletSigner, multisigPda: PublicKey,
  recipient: PublicKey, totalBaseUnits: number, platformWallet?: PublicKey, memo?: string,
  referrerWallet?: PublicKey, referrerFeePct: number = 0,
) => createProposalApproveExecuteSplWA(connection, wallet, multisigPda, recipient, totalBaseUnits, platformWallet, memo, USDC_MINT, referrerWallet, referrerFeePct)

export const getVaultUsdcBalance = (
  connection: Connection, multisigPda: PublicKey,
) => getVaultSplBalance(connection, multisigPda, USDC_MINT, USDC_DECIMALS).then(r => ({ usdcBalance: r.balance, vaultAta: r.vaultAta }))

export const verifyUsdcTransferTx = (
  txSignature: string, expectedRecipient: string, minAmount: number, mint: PublicKey = USDC_MINT,
) => verifySplTransferTx(txSignature, expectedRecipient, minAmount, mint)

export const verifyUsdcFundingTx = (
  txSignature: string, vaultAddress: string, expectedBaseUnits: number,
) => verifySplFundingTx(txSignature, vaultAddress, expectedBaseUnits, USDC_MINT)
