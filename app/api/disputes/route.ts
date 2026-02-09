import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

const ARBITER_WALLET = process.env.ARBITER_WALLET_ADDRESS

/** GET /api/disputes
 *  List all disputes. Arbiter sees all, users see only their own.
 *  Query params: status (PENDING, ACCEPTED, DENIED), limit, page
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId, wallet } = auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')?.toUpperCase()
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)

  const isArbiter = wallet === ARBITER_WALLET

  // Build where clause
  const where: any = {}
  if (status && ['PENDING', 'ACCEPTED', 'DENIED'].includes(status)) {
    where.status = status
  }

  // Non-arbiters only see disputes they're involved in
  if (!isArbiter) {
    where.OR = [
      { raisedByWallet: wallet },
      { bid: { task: { creatorId: userId } } },
      { bid: { bidderId: userId } },
    ]
  }

  const [disputes, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      include: {
        bid: {
          include: {
            task: { include: { creator: true } },
            bidder: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.dispute.count({ where }),
  ])

  const formatted = disputes.map((d) => ({
    id: d.id,
    raisedBy: d.raisedBy,
    raisedByWallet: d.raisedByWallet,
    proposalIndex: d.proposalIndex,
    reason: d.reason,
    evidenceUrls: d.evidenceUrls,
    status: d.status,
    responseReason: d.responseReason,
    responseEvidence: d.responseEvidence,
    resolutionNotes: d.resolutionNotes,
    resolvedByWallet: d.resolvedByWallet,
    createdAt: d.createdAt.toISOString(),
    resolvedAt: d.resolvedAt?.toISOString() || null,
    task: {
      id: d.bid.task.id,
      title: d.bid.task.title,
      status: d.bid.task.status,
      budgetLamports: d.bid.task.budgetLamports.toString(),
      creator: {
        id: d.bid.task.creator.id,
        walletAddress: d.bid.task.creator.walletAddress,
        profilePicUrl: d.bid.task.creator.profilePicUrl,
      },
    },
    bid: {
      id: d.bid.id,
      amountLamports: d.bid.amountLamports.toString(),
      status: d.bid.status,
      multisigAddress: d.bid.multisigAddress,
      vaultAddress: d.bid.vaultAddress,
      bidder: {
        id: d.bid.bidder.id,
        walletAddress: d.bid.bidder.walletAddress,
        profilePicUrl: d.bid.bidder.profilePicUrl,
      },
    },
  }))

  return Response.json({
    success: true,
    disputes: formatted,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
    isArbiter,
  })
}
