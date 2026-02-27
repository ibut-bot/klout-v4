import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://klout.gg'
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
  const taskType = searchParams.get('taskType')?.toUpperCase()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))
  const skip = (page - 1) * limit

  const submitterUsername = searchParams.get('submitterUsername')

  const where: any = { creatorId: userId }
  if (taskType && ['QUOTE', 'COMPETITION', 'CAMPAIGN'].includes(taskType)) {
    where.taskType = taskType
  }
  if (submitterUsername) {
    where.campaignSubmissions = {
      some: { submitter: { username: submitterUsername } },
    }
  }
  if (status && ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED', 'PAUSED'].includes(status)) {
    // For CAMPAIGN tasks with COMPLETED filter, also include budget-exhausted campaigns
    if (status === 'COMPLETED' && taskType === 'CAMPAIGN') {
      where.OR = [
        { status: 'COMPLETED' },
        { campaignConfig: { budgetRemainingLamports: { lte: 0 } } },
      ]
    } else {
      where.status = status
    }
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        creator: { select: { walletAddress: true, username: true, profilePicUrl: true } },
        _count: { select: { bids: true, campaignSubmissions: true } },
        campaignConfig: true,
        winningBid: {
          include: {
            bidder: { select: { walletAddress: true, username: true, profilePicUrl: true } },
          },
        },
        bids: {
          where: { winnerPlace: { not: null } },
          select: { winnerPlace: true, status: true, bidder: { select: { username: true, walletAddress: true } } },
          orderBy: { winnerPlace: 'asc' },
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
      taskType: t.taskType,
      platform: t.platform,
      paymentToken: t.paymentToken,
      status: t.taskType === 'CAMPAIGN' && t.status === 'OPEN' && t.campaignConfig && t.campaignConfig.budgetRemainingLamports <= 0 ? 'COMPLETED' : t.status,
      creatorWallet: t.creator.walletAddress,
      creatorUsername: t.creator.username,
      creatorProfilePic: t.creator.profilePicUrl,
      bidCount: t._count.bids,
      submissionCount: t._count.campaignSubmissions,
      budgetRemainingLamports: t.campaignConfig?.budgetRemainingLamports?.toString() || null,
      campaignConfig: t.campaignConfig ? {
        cpmLamports: t.campaignConfig.cpmLamports.toString(),
        budgetRemainingLamports: t.campaignConfig.budgetRemainingLamports.toString(),
        guidelines: t.campaignConfig.guidelines,
        heading: t.campaignConfig.heading,
        minViews: t.campaignConfig.minViews,
        minLikes: t.campaignConfig.minLikes,
        minRetweets: t.campaignConfig.minRetweets,
        minComments: t.campaignConfig.minComments,
        minPayoutLamports: t.campaignConfig.minPayoutLamports.toString(),
        maxBudgetPerUserPercent: t.campaignConfig.maxBudgetPerUserPercent,
        maxBudgetPerPostPercent: t.campaignConfig.maxBudgetPerPostPercent,
        minKloutScore: t.campaignConfig.minKloutScore,
        requireFollowX: t.campaignConfig.requireFollowX,
        collateralLink: t.campaignConfig.collateralLink,
        bonusMinKloutScore: t.campaignConfig.bonusMinKloutScore,
        bonusMaxLamports: t.campaignConfig.bonusMaxLamports?.toString() ?? null,
      } : null,
      imageUrl: t.imageUrl,
      imageTransform: t.imageTransform,
      vaultAddress: t.vaultAddress,
      maxWinners: t.maxWinners,
      prizeStructure: t.prizeStructure,
      customTokenMint: t.customTokenMint,
      customTokenSymbol: t.customTokenSymbol,
      customTokenDecimals: t.customTokenDecimals,
      customTokenLogoUri: t.customTokenLogoUri,
      competitionWinners: t.taskType === 'COMPETITION' ? t.bids
        .filter(b => b.winnerPlace != null)
        .map(b => ({
          place: b.winnerPlace!,
          status: b.status,
          bidderUsername: b.bidder.username,
          bidderWallet: b.bidder.walletAddress,
        })) : undefined,
      isPublicFeed: t.isPublicFeed,
      allowPreLivePosts: t.allowPreLivePosts,
      deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
      url: `${APP_URL}/tasks/${t.id}`,
      winningBid: t.winningBid ? {
        id: t.winningBid.id,
        amountLamports: t.winningBid.amountLamports.toString(),
        status: t.winningBid.status,
        bidderWallet: t.winningBid.bidder.walletAddress,
        bidderUsername: t.winningBid.bidder.username,
        bidderProfilePic: t.winningBid.bidder.profilePicUrl,
      } : null,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    network: NETWORK,
    explorerPrefix: EXPLORER_PREFIX,
  })
}
