import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { getKloutCpmMultiplier } from '@/lib/klout-cpm'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tasks/[id]/campaign-stats
 * Get aggregated stats for a campaign task.
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
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.taskType !== 'CAMPAIGN' || !task.campaignConfig) {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'This endpoint is only for CAMPAIGN tasks' },
      { status: 400 }
    )
  }

  const submissions = await prisma.campaignSubmission.findMany({
    where: { taskId },
    select: { status: true, viewCount: true, payoutLamports: true, submitterId: true },
  })

  const totalSubmissions = submissions.length
  const approved = submissions.filter((s) => s.status === 'APPROVED').length
  const paymentRequested = submissions.filter((s) => s.status === 'PAYMENT_REQUESTED').length
  const paid = submissions.filter((s) => s.status === 'PAID').length
  const rejected = submissions.filter((s) => s.status === 'REJECTED' || s.status === 'CREATOR_REJECTED').length
  const pending = submissions.filter((s) => !['APPROVED', 'PAYMENT_REQUESTED', 'PAID', 'REJECTED', 'CREATOR_REJECTED'].includes(s.status)).length

  const totalViews = submissions
    .filter((s) => s.viewCount !== null)
    .reduce((sum, s) => sum + (s.viewCount || 0), 0)

  const paidViews = submissions
    .filter((s) => s.status === 'PAID' && s.viewCount !== null)
    .reduce((sum, s) => sum + (s.viewCount || 0), 0)

  const totalSpent = submissions
    .filter((s) => s.status === 'PAID' && s.payoutLamports)
    .reduce((sum, s) => sum + Number(s.payoutLamports), 0)

  // Budget allocated = PAYMENT_REQUESTED + PAID (only these have budget deducted)
  const totalAllocated = submissions
    .filter((s) => (s.status === 'PAYMENT_REQUESTED' || s.status === 'PAID') && s.payoutLamports)
    .reduce((sum, s) => sum + Number(s.payoutLamports), 0)

  // Calculate per-user totals for the requesting user
  const { userId } = auth
  const myApprovedPayout = submissions
    .filter((s) => s.submitterId === userId && s.status === 'APPROVED' && s.payoutLamports)
    .reduce((sum, s) => sum + Number(s.payoutLamports), 0)

  const myTotalEarned = submissions
    .filter((s) => s.submitterId === userId && ['APPROVED', 'PAYMENT_REQUESTED', 'PAID'].includes(s.status) && s.payoutLamports)
    .reduce((sum, s) => sum + Number(s.payoutLamports), 0)

  // Calculate this user's Klout-based budget cap
  const latestScore = await prisma.xScoreData.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { totalScore: true },
  })
  const userMultiplier = getKloutCpmMultiplier(latestScore?.totalScore ?? 0)
  const topUserPercent = task.campaignConfig.maxBudgetPerUserPercent ?? 10
  const userPercent = topUserPercent * userMultiplier
  const myBudgetCap = Math.floor(Number(task.budgetLamports) * (userPercent / 100))

  return Response.json({
    success: true,
    stats: {
      totalBudgetLamports: task.budgetLamports.toString(),
      budgetRemainingLamports: task.campaignConfig.budgetRemainingLamports.toString(),
      budgetAllocatedLamports: totalAllocated.toString(),
      budgetSpentLamports: totalSpent.toString(),
      cpmLamports: task.campaignConfig.cpmLamports.toString(),
      minViews: task.campaignConfig.minViews,
      minPayoutLamports: task.campaignConfig.minPayoutLamports.toString(),
      maxBudgetPerUserPercent: task.campaignConfig.maxBudgetPerUserPercent,
      totalSubmissions,
      approved,
      paymentRequested,
      paid,
      rejected,
      pending,
      totalViews,
      paidViews,
      myApprovedPayoutLamports: myApprovedPayout.toString(),
      myTotalEarnedLamports: myTotalEarned.toString(),
      myBudgetCapLamports: myBudgetCap.toString(),
    },
  })
}
