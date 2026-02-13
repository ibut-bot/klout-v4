import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://slopwork.xyz'
const NETWORK = process.env.SOLANA_NETWORK || 'mainnet'
const EXPLORER_PREFIX = NETWORK === 'mainnet' ? 'https://solscan.io' : `https://solscan.io?cluster=${NETWORK}`

/** GET /api/me/bids
 *  List bids placed by the authenticated user.
 *  Query params: status, limit, page
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')?.toUpperCase()
  const taskType = searchParams.get('taskType')?.toUpperCase()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))
  const skip = (page - 1) * limit

  const where: any = { bidderId: userId }
  if (status && ['PENDING', 'ACCEPTED', 'REJECTED', 'FUNDED', 'PAYMENT_REQUESTED', 'COMPLETED', 'DISPUTED'].includes(status)) {
    where.status = status
  }
  if (taskType && ['QUOTE', 'COMPETITION', 'CAMPAIGN'].includes(taskType)) {
    where.task = { taskType }
  }

  const [bids, total] = await Promise.all([
    prisma.bid.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        bidder: { select: { walletAddress: true, username: true, profilePicUrl: true } },
        task: {
          include: {
            creator: { select: { walletAddress: true, username: true, profilePicUrl: true } },
            _count: { select: { bids: true } },
          },
        },
      },
    }),
    prisma.bid.count({ where }),
  ])

  return Response.json({
    success: true,
    bids: bids.map((b) => ({
      id: b.id,
      amountLamports: b.amountLamports.toString(),
      description: b.description,
      status: b.status,
      multisigAddress: b.multisigAddress,
      vaultAddress: b.vaultAddress,
      proposalIndex: b.proposalIndex,
      createdAt: b.createdAt.toISOString(),
      bidderWallet: b.bidder.walletAddress,
      bidderUsername: b.bidder.username,
      bidderProfilePic: b.bidder.profilePicUrl,
      task: {
        id: b.task.id,
        title: b.task.title,
        description: b.task.description,
        budgetLamports: b.task.budgetLamports.toString(),
        status: b.task.status,
        creatorWallet: b.task.creator.walletAddress,
        creatorUsername: b.task.creator.username,
        creatorProfilePic: b.task.creator.profilePicUrl,
        url: `${APP_URL}/tasks/${b.task.id}`,
        bidCount: b.task._count.bids,
      },
      isWinningBid: b.task.winningBidId === b.id,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    network: NETWORK,
    explorerPrefix: EXPLORER_PREFIX,
  })
}
