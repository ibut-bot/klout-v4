import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

const ARBITER_WALLET = process.env.ARBITER_WALLET_ADDRESS

/** GET /api/disputes/:id
 *  Get dispute details. Only accessible to parties involved or arbiter.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId, wallet } = auth
  const { id } = await params

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      bid: {
        include: {
          task: { include: { creator: true } },
          bidder: true,
        },
      },
    },
  })

  if (!dispute) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Dispute not found' }, { status: 404 })
  }

  // Check access: must be creator, bidder, or arbiter
  const isCreator = dispute.bid.task.creatorId === userId
  const isBidder = dispute.bid.bidderId === userId
  const isArbiter = wallet === ARBITER_WALLET

  if (!isCreator && !isBidder && !isArbiter) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Access denied' },
      { status: 403 }
    )
  }

  return Response.json({
    success: true,
    dispute: {
      id: dispute.id,
      raisedBy: dispute.raisedBy,
      raisedByWallet: dispute.raisedByWallet,
      proposalIndex: dispute.proposalIndex,
      proposalTxSig: dispute.proposalTxSig,
      reason: dispute.reason,
      evidenceUrls: dispute.evidenceUrls,
      status: dispute.status,
      responseReason: dispute.responseReason,
      responseEvidence: dispute.responseEvidence,
      resolutionNotes: dispute.resolutionNotes,
      resolvedByWallet: dispute.resolvedByWallet,
      resolveTxSig: dispute.resolveTxSig,
      executeTxSig: dispute.executeTxSig,
      createdAt: dispute.createdAt.toISOString(),
      updatedAt: dispute.updatedAt.toISOString(),
      resolvedAt: dispute.resolvedAt?.toISOString() || null,
    },
    task: {
      id: dispute.bid.task.id,
      title: dispute.bid.task.title,
      description: dispute.bid.task.description,
      status: dispute.bid.task.status,
      budgetLamports: dispute.bid.task.budgetLamports.toString(),
      creator: {
        id: dispute.bid.task.creator.id,
        walletAddress: dispute.bid.task.creator.walletAddress,
        profilePicUrl: dispute.bid.task.creator.profilePicUrl,
      },
    },
    bid: {
      id: dispute.bid.id,
      amountLamports: dispute.bid.amountLamports.toString(),
      description: dispute.bid.description,
      status: dispute.bid.status,
      multisigAddress: dispute.bid.multisigAddress,
      vaultAddress: dispute.bid.vaultAddress,
      proposalIndex: dispute.bid.proposalIndex,
      bidder: {
        id: dispute.bid.bidder.id,
        walletAddress: dispute.bid.bidder.walletAddress,
        profilePicUrl: dispute.bid.bidder.profilePicUrl,
      },
    },
    isArbiter,
    isCreator,
    isBidder,
  })
}
