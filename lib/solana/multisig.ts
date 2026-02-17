/**
 * Squads Multisig utilities -- ported from my-solana-wallet.
 * Contains both Keypair-based (for CLI/agents) and WalletAdapter-based (for browser) functions.
 */

import * as multisig from '@sqds/multisig'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'

const { Permission, Permissions } = multisig.types

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface MultisigMember {
  publicKey: string
  permissions: { initiate: boolean; vote: boolean; execute: boolean }
}

export interface MultisigVault {
  address: string
  createKey: string
  threshold: number
  members: MultisigMember[]
  transactionIndex: bigint
  staleTransactionIndex: bigint
  rentCollector: string | null
  bump: number
}

export interface VaultBalance {
  solBalance: number
  vaultPda: string
}

export interface ProposalInfo {
  index: bigint
  multisigPda: string
  transactionPda: string
  proposalPda: string
  status: 'Active' | 'Approved' | 'Rejected' | 'Executed' | 'Cancelled' | 'Draft'
  approvals: string[]
  rejections: string[]
}

// ──────────────────────────────────────────────
// PDA Helpers
// ──────────────────────────────────────────────

export function getProgramConfigPda(): PublicKey {
  return multisig.getProgramConfigPda({})[0]
}

export function getMultisigPda(createKey: PublicKey): PublicKey {
  return multisig.getMultisigPda({ createKey })[0]
}

export function getVaultPda(multisigPda: PublicKey, index: number = 0): PublicKey {
  return multisig.getVaultPda({ multisigPda, index })[0]
}

// ──────────────────────────────────────────────
// Permission Helpers
// ──────────────────────────────────────────────

export function getAllPermissions(): multisig.types.Permissions {
  return Permissions.all()
}

export function createPermissions(
  initiate: boolean,
  vote: boolean,
  execute: boolean
): multisig.types.Permissions {
  const perms: multisig.types.Permission[] = []
  if (initiate) perms.push(Permission.Initiate)
  if (vote) perms.push(Permission.Vote)
  if (execute) perms.push(Permission.Execute)
  return Permissions.fromPermissions(perms)
}

// ──────────────────────────────────────────────
// Keypair-based functions (CLI / Agents)
// ──────────────────────────────────────────────

export async function createMultisigVault(
  connection: Connection,
  creator: Keypair,
  members: { publicKey: PublicKey; permissions: multisig.types.Permissions }[],
  threshold: number,
  timeLock: number = 0
): Promise<{ multisigPda: PublicKey; vaultPda: PublicKey; signature: string }> {
  const createKey = Keypair.generate()
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })

  const programConfigPda = getProgramConfigPda()
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
    connection,
    programConfigPda
  )

  const ix = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: creator.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock,
    members: members.map((m) => ({ key: m.publicKey, permissions: m.permissions })),
    threshold,
    treasury: programConfig.treasury,
    rentCollector: null,
  })

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = creator.publicKey
  transaction.add(ix)
  transaction.sign(creator, createKey)

  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })
  return { multisigPda, vaultPda, signature }
}

/** Platform fee: 10% to platform, 90% to recipient. Supports optional referrer split. */
const PLATFORM_FEE_BPS = 1000 // 10% = 1000 basis points

export interface PaymentSplit {
  recipientAmount: number
  platformAmount: number
  referrerAmount: number
}

/**
 * Calculate payment split. When referrerFeePct > 0, the 10% platform fee is
 * further split between referrer and platform (e.g. 70% of 10% to referrer).
 */
export function splitPayment(
  totalLamports: number,
  platformWallet?: PublicKey,
  referrerFeePct: number = 0,
): PaymentSplit {
  if (!platformWallet) return { recipientAmount: totalLamports, platformAmount: 0, referrerAmount: 0 }
  const totalPlatformFee = Math.floor(totalLamports * PLATFORM_FEE_BPS / 10000)
  const recipientAmount = totalLamports - totalPlatformFee

  if (referrerFeePct > 0 && referrerFeePct <= 100) {
    const referrerAmount = Math.floor(totalPlatformFee * referrerFeePct / 100)
    const platformAmount = totalPlatformFee - referrerAmount
    return { recipientAmount, platformAmount, referrerAmount }
  }

  return { recipientAmount, platformAmount: totalPlatformFee, referrerAmount: 0 }
}

export async function createTransferProposal(
  connection: Connection,
  creator: Keypair,
  multisigPda: PublicKey,
  recipient: PublicKey,
  lamports: number,
  memo?: string,
  platformWallet?: PublicKey,
  referrerWallet?: PublicKey,
  referrerFeePct: number = 0,
): Promise<{ transactionIndex: bigint; signature: string }> {
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1)
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const { recipientAmount, platformAmount, referrerAmount } = splitPayment(lamports, platformWallet, referrerFeePct)

  const transferInstructions = [
    SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: recipient, lamports: recipientAmount }),
  ]
  if (platformWallet && platformAmount > 0) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: platformWallet, lamports: platformAmount })
    )
  }
  if (referrerWallet && referrerAmount > 0) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: referrerWallet, lamports: referrerAmount })
    )
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const transferMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: transferInstructions,
  })

  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: transferMessage,
    memo,
  })

  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
  })

  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = creator.publicKey
  transaction.add(createVaultTxIx, createProposalIx)
  transaction.sign(creator)

  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  return { transactionIndex, signature }
}

export async function approveProposal(
  connection: Connection,
  member: Keypair,
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<string> {
  const ix = multisig.instructions.proposalApprove({ multisigPda, transactionIndex, member: member.publicKey })
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = member.publicKey
  transaction.add(ix)
  transaction.sign(member)
  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  return signature
}

export async function rejectProposal(
  connection: Connection,
  member: Keypair,
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<string> {
  const ix = multisig.instructions.proposalReject({ multisigPda, transactionIndex, member: member.publicKey })
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = member.publicKey
  transaction.add(ix)
  transaction.sign(member)
  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  return signature
}

export async function executeVaultTransaction(
  connection: Connection,
  executor: Keypair,
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const executeResult = await multisig.instructions.vaultTransactionExecute({
    connection,
    multisigPda,
    transactionIndex,
    member: executor.publicKey,
  })

  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = executor.publicKey
  transaction.add(executeResult.instruction)
  transaction.sign(executor)

  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  return signature
}

// ──────────────────────────────────────────────
// Read-only helpers (work for both CLI and browser)
// ──────────────────────────────────────────────

export async function getMultisigAccount(
  connection: Connection,
  multisigPda: PublicKey
): Promise<MultisigVault | null> {
  try {
    const account = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
    return {
      address: multisigPda.toBase58(),
      createKey: account.createKey.toBase58(),
      threshold: account.threshold,
      members: account.members.map((m: any) => ({
        publicKey: m.key.toBase58(),
        permissions: {
          initiate: Permissions.has(m.permissions, Permission.Initiate),
          vote: Permissions.has(m.permissions, Permission.Vote),
          execute: Permissions.has(m.permissions, Permission.Execute),
        },
      })),
      transactionIndex: BigInt(account.transactionIndex.toString()),
      staleTransactionIndex: BigInt(account.staleTransactionIndex.toString()),
      rentCollector: account.rentCollector?.toBase58() || null,
      bump: account.bump,
    }
  } catch {
    return null
  }
}

export async function getVaultBalance(
  connection: Connection,
  multisigPda: PublicKey
): Promise<VaultBalance> {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })
  const balance = await connection.getBalance(vaultPda)
  return { solBalance: balance / LAMPORTS_PER_SOL, vaultPda: vaultPda.toBase58() }
}

export async function getProposalStatus(
  connection: Connection,
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<ProposalInfo | null> {
  try {
    const [transactionPda] = multisig.getTransactionPda({ multisigPda, index: transactionIndex })
    const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex })
    const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda)

    let status: ProposalInfo['status'] = 'Draft'
    if (proposal.status.__kind === 'Active') status = 'Active'
    else if (proposal.status.__kind === 'Approved') status = 'Approved'
    else if (proposal.status.__kind === 'Rejected') status = 'Rejected'
    else if (proposal.status.__kind === 'Executed') status = 'Executed'
    else if (proposal.status.__kind === 'Cancelled') status = 'Cancelled'

    return {
      index: transactionIndex,
      multisigPda: multisigPda.toBase58(),
      transactionPda: transactionPda.toBase58(),
      proposalPda: proposalPda.toBase58(),
      status,
      approvals: proposal.approved.map((pk: PublicKey) => pk.toBase58()),
      rejections: proposal.rejected.map((pk: PublicKey) => pk.toBase58()),
    }
  } catch {
    return null
  }
}

export async function getProposals(
  connection: Connection,
  multisigPda: PublicKey
): Promise<ProposalInfo[]> {
  const multisigAccount = await getMultisigAccount(connection, multisigPda)
  if (!multisigAccount) return []
  const proposals: ProposalInfo[] = []
  const currentIndex = Number(multisigAccount.transactionIndex)
  const startIndex = Math.max(1, currentIndex - 19)
  for (let i = startIndex; i <= currentIndex; i++) {
    const proposal = await getProposalStatus(connection, multisigPda, BigInt(i))
    if (proposal) proposals.push(proposal)
  }
  return proposals.reverse()
}

// ──────────────────────────────────────────────
// WalletAdapter-based functions (Browser)
// ──────────────────────────────────────────────

export interface WalletSigner {
  publicKey: PublicKey
  signTransaction: (tx: Transaction) => Promise<Transaction>
}

export async function createMultisigVaultWA(
  connection: Connection,
  wallet: WalletSigner,
  members: { publicKey: PublicKey; permissions: multisig.types.Permissions }[],
  threshold: number,
  timeLock: number = 0
): Promise<{ multisigPda: PublicKey; vaultPda: PublicKey; signature: string }> {
  const createKey = Keypair.generate()
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })

  const programConfigPda = getProgramConfigPda()
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)

  const ix = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: wallet.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock,
    members: members.map((m) => ({ key: m.publicKey, permissions: m.permissions })),
    threshold,
    treasury: programConfig.treasury,
    rentCollector: null,
  })

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = wallet.publicKey
  transaction.add(ix)

  // Phantom wallet signs first, then additional signers (required by Phantom Lighthouse)
  const signedTx = await wallet.signTransaction(transaction)
  signedTx.partialSign(createKey)

  const signature = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })
  return { multisigPda, vaultPda, signature }
}

/**
 * Create multisig vault + payment proposal + self-approve ALL in one transaction (one wallet popup).
 * Used for competition mode entries to reduce from 2 confirmations to 1.
 */
export async function createMultisigVaultAndProposalWA(
  connection: Connection,
  wallet: WalletSigner,
  members: { publicKey: PublicKey; permissions: multisig.types.Permissions }[],
  threshold: number,
  recipient: PublicKey,
  lamports: number,
  memo?: string,
  platformWallet?: PublicKey,
  referrerWallet?: PublicKey,
  referrerFeePct: number = 0,
): Promise<{
  multisigPda: PublicKey
  vaultPda: PublicKey
  transactionIndex: bigint
  signature: string
}> {
  const createKey = Keypair.generate()
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const programConfigPda = getProgramConfigPda()
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)

  const transactionIndex = BigInt(1)

  const { recipientAmount, platformAmount, referrerAmount } = splitPayment(lamports, platformWallet, referrerFeePct)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const createMultisigIx = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: wallet.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock: 0,
    members: members.map((m) => ({ key: m.publicKey, permissions: m.permissions })),
    threshold,
    treasury: programConfig.treasury,
    rentCollector: null,
  })

  const transferInstructions = [
    SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: recipient, lamports: recipientAmount }),
  ]
  if (platformWallet && platformAmount > 0) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: platformWallet, lamports: platformAmount })
    )
  }
  if (referrerWallet && referrerAmount > 0) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: referrerWallet, lamports: referrerAmount })
    )
  }

  const transferMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: transferInstructions,
  })

  // 3. Create vault transaction
  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: wallet.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: transferMessage,
    memo,
  })

  // 4. Create proposal
  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: wallet.publicKey,
  })

  // 5. Self-approve
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: wallet.publicKey,
  })

  // Bundle all 5 instructions into one transaction
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  tx.add(createMultisigIx, createVaultTxIx, createProposalIx, approveIx)

  const signedTx = await wallet.signTransaction(tx)
  signedTx.partialSign(createKey)

  const signature = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  return { multisigPda, vaultPda, transactionIndex, signature }
}

/**
 * Keypair-based: Create multisig vault + payment proposal + self-approve in one transaction.
 * Used by CLI scripts for competition mode.
 */
export async function createMultisigVaultAndProposal(
  connection: Connection,
  creator: Keypair,
  members: { publicKey: PublicKey; permissions: multisig.types.Permissions }[],
  threshold: number,
  recipient: PublicKey,
  lamports: number,
  memo?: string,
  platformWallet?: PublicKey,
  referrerWallet?: PublicKey,
  referrerFeePct: number = 0,
): Promise<{
  multisigPda: PublicKey
  vaultPda: PublicKey
  transactionIndex: bigint
  signature: string
}> {
  const createKey = Keypair.generate()
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const programConfigPda = getProgramConfigPda()
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)

  const transactionIndex = BigInt(1)
  const { recipientAmount, platformAmount, referrerAmount } = splitPayment(lamports, platformWallet, referrerFeePct)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const createMultisigIx = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: creator.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock: 0,
    members: members.map((m) => ({ key: m.publicKey, permissions: m.permissions })),
    threshold,
    treasury: programConfig.treasury,
    rentCollector: null,
  })

  const transferInstructions = [
    SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: recipient, lamports: recipientAmount }),
  ]
  if (platformWallet && platformAmount > 0) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: platformWallet, lamports: platformAmount })
    )
  }
  if (referrerWallet && referrerAmount > 0) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: referrerWallet, lamports: referrerAmount })
    )
  }

  const transferMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: transferInstructions,
  })

  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: transferMessage,
    memo,
  })

  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
  })

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: creator.publicKey,
  })

  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = creator.publicKey
  transaction.add(createMultisigIx, createVaultTxIx, createProposalIx, approveIx)
  transaction.sign(creator, createKey)

  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  return { multisigPda, vaultPda, transactionIndex, signature }
}

/** Create a SOL transfer proposal + auto-approve using wallet adapter (supports referrer split) */
export async function createTransferProposalWA(
  connection: Connection,
  wallet: WalletSigner,
  multisigPda: PublicKey,
  recipient: PublicKey,
  lamports: number,
  memo?: string,
  platformWallet?: PublicKey,
  referrerWallet?: PublicKey,
  referrerFeePct: number = 0,
): Promise<{ transactionIndex: bigint; signature: string }> {
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1)
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const { recipientAmount, platformAmount, referrerAmount } = splitPayment(lamports, platformWallet, referrerFeePct)

  const transferInstructions = [
    SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: recipient, lamports: recipientAmount }),
  ]
  if (platformWallet && platformAmount > 0) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: platformWallet, lamports: platformAmount })
    )
  }
  if (referrerWallet && referrerAmount > 0) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: referrerWallet, lamports: referrerAmount })
    )
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const transferMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: transferInstructions,
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

  // Bundle all 3 instructions: create vault tx + create proposal + self-approve
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  tx.add(createVaultTxIx, createProposalIx, approveIx)

  const signedTx = await wallet.signTransaction(tx)
  const sig = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')

  return { transactionIndex, signature: sig }
}

/** Approve a proposal using wallet adapter */
export async function approveProposalWA(
  connection: Connection,
  wallet: WalletSigner,
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<string> {
  const ix = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: wallet.publicKey,
  })

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  tx.add(ix)

  const signedTx = await wallet.signTransaction(tx)
  const sig = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  return sig
}

/** Execute an approved vault transaction using wallet adapter */
export async function executeVaultTransactionWA(
  connection: Connection,
  wallet: WalletSigner,
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const executeResult = await multisig.instructions.vaultTransactionExecute({
    connection,
    multisigPda,
    transactionIndex,
    member: wallet.publicKey,
  })

  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  tx.add(executeResult.instruction)

  const signedTx = await wallet.signTransaction(tx)
  const sig = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  return sig
}

/** Approve + execute in a single transaction (one wallet popup) */
export async function approveAndExecuteWA(
  connection: Connection,
  wallet: WalletSigner,
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<string> {
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: wallet.publicKey,
  })

  const executeResult = await multisig.instructions.vaultTransactionExecute({
    connection,
    multisigPda,
    transactionIndex,
    member: wallet.publicKey,
  })

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  tx.add(approveIx, executeResult.instruction)

  const signedTx = await wallet.signTransaction(tx)
  const sig = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')
  return sig
}

// ──────────────────────────────────────────────
// Competition-specific functions
// ──────────────────────────────────────────────

/**
 * WalletAdapter: Create a 1/1 multisig vault (creator only) and fund it with SOL — all in one transaction.
 * Used when a competition task is created so the budget is locked in the vault upfront.
 */
export async function createMultisigVaultAndFundWA(
  connection: Connection,
  wallet: WalletSigner,
  budgetLamports: number,
): Promise<{ multisigPda: PublicKey; vaultPda: PublicKey; signature: string }> {
  const createKey = Keypair.generate()
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const programConfigPda = getProgramConfigPda()
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda)

  // 1. Create 1/1 multisig with creator as sole member
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

  // 2. Fund the vault with the budget
  const fundIx = SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: vaultPda,
    lamports: budgetLamports,
  })

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  tx.add(createMultisigIx, fundIx)

  const signedTx = await wallet.signTransaction(tx)
  signedTx.partialSign(createKey)

  const signature = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  return { multisigPda, vaultPda, signature }
}

/**
 * Keypair: Create a 1/1 multisig vault (creator only) and fund it with SOL — all in one transaction.
 * Used by CLI scripts when creating competition tasks.
 */
export async function createMultisigVaultAndFund(
  connection: Connection,
  creator: Keypair,
  budgetLamports: number,
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

  const fundIx = SystemProgram.transfer({
    fromPubkey: creator.publicKey,
    toPubkey: vaultPda,
    lamports: budgetLamports,
  })

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = creator.publicKey
  transaction.add(createMultisigIx, fundIx)
  transaction.sign(creator, createKey)

  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  return { multisigPda, vaultPda, signature }
}

/**
 * WalletAdapter: Create proposal + approve + execute in one transaction for a 1/1 competition multisig.
 * Pays out 90% to the winner and 10% to the platform wallet.
 */
export async function createProposalApproveExecuteWA(
  connection: Connection,
  wallet: WalletSigner,
  multisigPda: PublicKey,
  recipient: PublicKey,
  totalLamports: number,
  platformWallet?: PublicKey,
  memo?: string,
  referrerWallet?: PublicKey,
  referrerFeePct: number = 0,
): Promise<{ transactionIndex: bigint; signature: string }> {
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1)
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const { recipientAmount, platformAmount, referrerAmount } = splitPayment(totalLamports, platformWallet, referrerFeePct)

  const transferInstructions = [
    SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: recipient, lamports: recipientAmount }),
  ]
  if (platformAmount > 0 && platformWallet) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: platformWallet, lamports: platformAmount })
    )
  }
  if (referrerAmount > 0 && referrerWallet) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: referrerWallet, lamports: referrerAmount })
    )
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const transferMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: transferInstructions,
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
    { pubkey: recipient, isSigner: false, isWritable: true },
  ]
  if (platformAmount > 0 && platformWallet) {
    anchorRemainingAccounts.push({ pubkey: platformWallet, isSigner: false, isWritable: true })
  }
  if (referrerAmount > 0 && referrerWallet) {
    anchorRemainingAccounts.push({ pubkey: referrerWallet, isSigner: false, isWritable: true })
  }
  anchorRemainingAccounts.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false })

  const executeIx = multisig.generated.createVaultTransactionExecuteInstruction({
    multisig: multisigPda,
    transaction: transactionPda,
    proposal: proposalPda,
    member: wallet.publicKey,
    anchorRemainingAccounts,
  })

  // Bundle all into one transaction
  const tx = new Transaction()
  tx.recentBlockhash = blockhash
  tx.feePayer = wallet.publicKey
  tx.add(createVaultTxIx, createProposalIx, approveIx, executeIx)

  const signedTx = await wallet.signTransaction(tx)
  const sig = await connection.sendRawTransaction(signedTx.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed')

  return { transactionIndex, signature: sig }
}

/**
 * Keypair: Create proposal + approve + execute in one transaction for a 1/1 competition multisig.
 * Pays out 90% to the winner and 10% to the platform wallet.
 */
export async function createProposalApproveExecute(
  connection: Connection,
  creator: Keypair,
  multisigPda: PublicKey,
  recipient: PublicKey,
  totalLamports: number,
  platformWallet: PublicKey,
  memo?: string,
  referrerWallet?: PublicKey,
  referrerFeePct: number = 0,
): Promise<{ transactionIndex: bigint; signature: string }> {
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1)
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 })

  const { recipientAmount, platformAmount, referrerAmount } = splitPayment(totalLamports, platformWallet, referrerFeePct)

  const transferInstructions = [
    SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: recipient, lamports: recipientAmount }),
  ]
  if (platformAmount > 0) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: platformWallet, lamports: platformAmount })
    )
  }
  if (referrerAmount > 0 && referrerWallet) {
    transferInstructions.push(
      SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: referrerWallet, lamports: referrerAmount })
    )
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

  const transferMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: transferInstructions,
  })

  const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: transferMessage,
    memo,
  })

  const createProposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: creator.publicKey,
  })

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: creator.publicKey,
  })

  const [transactionPda] = multisig.getTransactionPda({ multisigPda, index: transactionIndex })
  const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex })

  const anchorRemainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: recipient, isSigner: false, isWritable: true },
  ]
  if (platformAmount > 0) {
    anchorRemainingAccounts.push({ pubkey: platformWallet, isSigner: false, isWritable: true })
  }
  if (referrerAmount > 0 && referrerWallet) {
    anchorRemainingAccounts.push({ pubkey: referrerWallet, isSigner: false, isWritable: true })
  }
  anchorRemainingAccounts.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false })

  const executeIx = multisig.generated.createVaultTransactionExecuteInstruction({
    multisig: multisigPda,
    transaction: transactionPda,
    proposal: proposalPda,
    member: creator.publicKey,
    anchorRemainingAccounts,
  })

  const transaction = new Transaction()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = creator.publicKey
  transaction.add(createVaultTxIx, createProposalIx, approveIx, executeIx)
  transaction.sign(creator)

  const signature = await connection.sendRawTransaction(transaction.serialize(), { maxRetries: 5 })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  return { transactionIndex, signature }
}
