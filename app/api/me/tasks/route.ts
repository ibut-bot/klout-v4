import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://slopwork.xyz'
const NETWORK = process.env.SOLANA_NETWORK || 'mainnet'
const EXPLORER_PREFIX = NETWORK === 'mainnet' ? 'https://solscan.io' : `https://solscan.io?cluster=${NETWORK}`

/** GET /api/me/tasks
 *  List tasks created by the authenticated user.
 *  Query params: status, limit, page
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')?.toUpperCase()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))
  const skip = (page - 1) * limit

  const where: any = { creatorId: userId }
  if (status && ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED'].includes(status)) {
    where.status = status
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        creator: { select: { walletAddress: true, profilePicUrl: true } },
        _count: { select: { bids: true } },
        winningBid: {
          include: {
            bidder: { select: { walletAddress: true, profilePicUrl: true } },
          },
        },
      },
    }),
    prisma.task.count({ where }),
  ])

  return Response.json({
    success: true,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      budgetLamports: t.budgetLamports.toString(),
      status: t.status,
      creatorWallet: t.creator.walletAddress,
      creatorProfilePic: t.creator.profilePicUrl,
      bidCount: t._count.bids,
      createdAt: t.createdAt.toISOString(),
      url: `${APP_URL}/tasks/${t.id}`,
      winningBid: t.winningBid ? {
        id: t.winningBid.id,
        amountLamports: t.winningBid.amountLamports.toString(),
        status: t.winningBid.status,
        bidderWallet: t.winningBid.bidder.walletAddress,
        bidderProfilePic: t.winningBid.bidder.profilePicUrl,
      } : null,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    network: NETWORK,
    explorerPrefix: EXPLORER_PREFIX,
  })
}
