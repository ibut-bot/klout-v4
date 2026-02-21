import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tasks/[id]/campaign-export
 * Returns all campaign submissions (no pagination) for export. Creator-only.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { id: taskId } = await context.params

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { campaignConfig: true },
  })

  if (!task) {
    return Response.json({ success: false, message: 'Task not found' }, { status: 404 })
  }

  if (task.taskType !== 'CAMPAIGN' || !task.campaignConfig) {
    return Response.json({ success: false, message: 'Not a campaign task' }, { status: 400 })
  }

  if (task.creatorId !== auth.userId) {
    const share = await prisma.campaignShare.findUnique({
      where: { taskId_sharedWithId: { taskId, sharedWithId: auth.userId } },
    })
    if (!share) {
      return Response.json({ success: false, message: 'Only the campaign creator or shared viewers can export' }, { status: 403 })
    }
  }

  let imageBase64: string | null = null
  if (task.imageUrl) {
    try {
      const imgRes = await fetch(task.imageUrl)
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer())
        const contentType = imgRes.headers.get('content-type') || 'image/png'
        imageBase64 = `data:${contentType};base64,${buf.toString('base64')}`
      }
    } catch { /* skip if image fetch fails */ }
  }

  const submissions = await prisma.campaignSubmission.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    include: {
      submitter: {
        select: {
          id: true, walletAddress: true, username: true, xUsername: true,
          xScores: {
            orderBy: { createdAt: 'desc' }, take: 1,
            select: { totalScore: true, followersCount: true, followingCount: true, geoTier: true, geoRegion: true },
          },
        },
      },
    },
  })

  return Response.json({
    success: true,
    task: {
      title: task.title,
      description: task.description,
      imageUrl: task.imageUrl || null,
      imageBase64,
      totalBudgetLamports: task.budgetLamports.toString(),
      budgetRemainingLamports: task.campaignConfig.budgetRemainingLamports.toString(),
      cpmLamports: task.campaignConfig.cpmLamports.toString(),
      minViews: task.campaignConfig.minViews,
      minLikes: task.campaignConfig.minLikes,
      minRetweets: task.campaignConfig.minRetweets,
      minComments: task.campaignConfig.minComments,
      minPayoutLamports: task.campaignConfig.minPayoutLamports.toString(),
      minKloutScore: task.campaignConfig.minKloutScore,
      maxBudgetPerUserPercent: task.campaignConfig.maxBudgetPerUserPercent,
      maxBudgetPerPostPercent: task.campaignConfig.maxBudgetPerPostPercent,
      requireFollowX: task.campaignConfig.requireFollowX,
      guidelines: task.campaignConfig.guidelines as { dos?: string[]; donts?: string[] } | null,
    },
    submissions: submissions.map((s) => ({
      id: s.id,
      postUrl: s.postUrl,
      viewCount: s.viewCount,
      payoutLamports: s.payoutLamports?.toString() || null,
      status: s.status,
      rejectionReason: s.rejectionReason,
      paymentTxSig: s.paymentTxSig,
      submitter: {
        walletAddress: s.submitter.walletAddress,
        username: s.submitter.username,
        xUsername: s.submitter.xUsername,
        kloutScore: s.submitter.xScores[0]?.totalScore ?? null,
        followers: s.submitter.xScores[0]?.followersCount ?? null,
        following: s.submitter.xScores[0]?.followingCount ?? null,
        geoTier: s.submitter.xScores[0]?.geoTier ?? null,
        geoRegion: s.submitter.xScores[0]?.geoRegion ?? null,
      },
      createdAt: s.createdAt.toISOString(),
    })),
  })
}
