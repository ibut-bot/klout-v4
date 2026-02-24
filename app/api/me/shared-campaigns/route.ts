import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

/**
 * GET /api/me/shared-campaigns
 * List campaigns that have been shared with the authenticated user.
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

  const shareWhere: any = { sharedWithId: userId }
  if (status && ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'PAUSED'].includes(status)) {
    shareWhere.task = { status }
  }

  const [shares, total] = await Promise.all([
    prisma.campaignShare.findMany({
      where: shareWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        task: {
          include: {
            creator: { select: { walletAddress: true, username: true, profilePicUrl: true } },
            _count: { select: { campaignSubmissions: true } },
            campaignConfig: true,
          },
        },
      },
    }),
    prisma.campaignShare.count({ where: shareWhere }),
  ])

  return Response.json({
    success: true,
    tasks: shares.map((s) => {
      const t = s.task
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        budgetLamports: t.budgetLamports.toString(),
        taskType: t.taskType,
        paymentToken: t.paymentToken,
        customTokenMint: t.customTokenMint,
        customTokenSymbol: t.customTokenSymbol,
        customTokenDecimals: t.customTokenDecimals,
        customTokenLogoUri: t.customTokenLogoUri,
        status: t.status,
        creatorWallet: t.creator.walletAddress,
        creatorUsername: t.creator.username,
        creatorProfilePic: t.creator.profilePicUrl,
        bidCount: 0,
        submissionCount: t._count.campaignSubmissions,
        budgetRemainingLamports: t.campaignConfig?.budgetRemainingLamports?.toString() || null,
        imageUrl: t.imageUrl,
        imageTransform: t.imageTransform,
        deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        sharedAt: s.createdAt.toISOString(),
      }
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}
