import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getConnection } from '@/lib/solana/connection'
import { PublicKey, ParsedTransactionWithMeta, ParsedInstruction } from '@solana/web3.js'

const PLATFORM_FEE_BPS = 1000 // 10%
const PLATFORM_WALLET = process.env.ARBITER_WALLET_ADDRESS

/** POST /api/tasks/:id/bids/:bidId/request-payment
 *  Bidder records on-chain proposal after creating it client-side.
 *  Body: { proposalIndex: number, txSignature: string }
 *
 *  Server validates the on-chain transaction includes the required
 *  platform fee transfer (10%) to the arbiter wallet.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id, bidId } = await params

  if (!PLATFORM_WALLET) {
    return Response.json(
      { success: false, error: 'SERVER_CONFIG_ERROR', message: 'Platform wallet (ARBITER_WALLET_ADDRESS) is not configured. Payment requests are disabled.' },
      { status: 503 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { proposalIndex, txSignature } = body
  if (proposalIndex === undefined || !txSignature) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: proposalIndex, txSignature' },
      { status: 400 }
    )
  }

  if (typeof proposalIndex !== 'number' || !Number.isInteger(proposalIndex) || proposalIndex < 0) {
    return Response.json(
      { success: false, error: 'INVALID_PROPOSAL_INDEX', message: 'proposalIndex must be a non-negative integer' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: { winningBid: { include: { bidder: true } } },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (!task.winningBid || task.winningBid.id !== bidId) {
    return Response.json(
      { success: false, error: 'NOT_WINNING_BID', message: 'This is not the winning bid' },
      { status: 400 }
    )
  }

  // Only the winning bidder can request payment
  if (task.winningBid.bidderId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the winning bidder can request payment' },
      { status: 403 }
    )
  }

  if (task.winningBid.status !== 'FUNDED') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Bid is ${task.winningBid.status}, must be FUNDED to request payment` },
      { status: 400 }
    )
  }

  // Verify the transaction signature exists on-chain and includes the platform fee
  try {
    const connection = getConnection()
    const tx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    })
    if (!tx) {
      return Response.json(
        { success: false, error: 'TX_NOT_FOUND', message: 'Transaction not found or not confirmed on-chain' },
        { status: 400 }
      )
    }
    if (tx.meta?.err) {
      return Response.json(
        { success: false, error: 'TX_FAILED', message: 'Transaction failed on-chain' },
        { status: 400 }
      )
    }

    // --- Validate platform fee split in the proposal ---
    const totalLamports = Number(task.winningBid.amountLamports)
    const expectedPlatformFee = Math.floor(totalLamports * PLATFORM_FEE_BPS / 10000)
    const feeError = validatePlatformFee(tx, PLATFORM_WALLET, expectedPlatformFee)
    if (feeError) {
      return Response.json(
        { success: false, error: 'MISSING_PLATFORM_FEE', message: feeError },
        { status: 400 }
      )
    }
  } catch (e: any) {
    if (e?.status) throw e // re-throw Response-like errors
    return Response.json(
      { success: false, error: 'TX_VERIFY_ERROR', message: e.message || 'Failed to verify transaction on-chain' },
      { status: 400 }
    )
  }

  await prisma.bid.update({
    where: { id: bidId },
    data: {
      status: 'PAYMENT_REQUESTED',
      proposalIndex: Number(proposalIndex),
    },
  })

  return Response.json({
    success: true,
    message: 'Payment request recorded. Waiting for task creator approval.',
    proposalIndex,
    txSignature,
  })
}

/**
 * Scan parsed transaction for a SOL transfer to the platform wallet
 * with at least the expected platform fee amount.
 * Returns an error message string if validation fails, or null if OK.
 */
function validatePlatformFee(
  tx: ParsedTransactionWithMeta,
  platformWallet: string,
  expectedMinLamports: number,
): string | null {
  // Collect all SOL transfers from both top-level and inner instructions
  let platformTransferTotal = 0

  const checkInstruction = (ix: any) => {
    if (
      'parsed' in ix &&
      ix.program === 'system' &&
      ix.parsed?.type === 'transfer' &&
      ix.parsed.info?.destination === platformWallet
    ) {
      platformTransferTotal += Number(ix.parsed.info.lamports || 0)
    }
  }

  // Top-level instructions
  for (const ix of tx.transaction.message.instructions) {
    checkInstruction(ix)
  }

  // Inner instructions (vault transactions show up here)
  for (const inner of tx.meta?.innerInstructions || []) {
    for (const ix of inner.instructions) {
      checkInstruction(ix)
    }
  }

  if (platformTransferTotal === 0) {
    return `Proposal must include a platform fee transfer to ${platformWallet}. No transfer to the platform wallet was found in this transaction. Use GET /api/config to fetch arbiterWalletAddress and platformFeeBps (currently 10%).`
  }

  if (platformTransferTotal < expectedMinLamports) {
    return `Platform fee too low: found ${platformTransferTotal} lamports, expected at least ${expectedMinLamports} lamports (10% of ${expectedMinLamports * 10} escrow). Use GET /api/config to fetch platformFeeBps.`
  }

  return null
}
