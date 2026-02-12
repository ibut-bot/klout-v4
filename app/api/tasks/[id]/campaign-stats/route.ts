import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

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
    select: { status: true, viewCount: true, payoutLamports: true },
  })

  const totalSubmissions = submissions.length
  const approved = submissions.filter((s) => s.status === 'APPROVED').length
  const paid = submissions.filter((s) => s.status === 'PAID').length
  const rejected = submissions.filter((s) => s.status === 'REJECTED' || s.status === 'CREATOR_REJECTED').length
  const pending = submissions.filter((s) => !['APPROVED', 'PAID', 'REJECTED', 'CREATOR_REJECTED'].includes(s.status)).length

  const totalViews = submissions
    .filter((s) => s.viewCount !== null)
    .reduce((sum, s) => sum + (s.viewCount || 0), 0)

  const totalSpent = submissions
    .filter((s) => s.status === 'PAID' && s.payoutLamports)
    .reduce((sum, s) => sum + Number(s.payoutLamports), 0)

  const totalAllocated = submissions
    .filter((s) => (s.status === 'APPROVED' || s.status === 'PAID') && s.payoutLamports)
    .reduce((sum, s) => sum + Number(s.payoutLamports), 0)

  return Response.json({
    success: true,
    stats: {
      totalBudgetLamports: task.budgetLamports.toString(),
      budgetRemainingLamports: task.campaignConfig.budgetRemainingLamports.toString(),
      budgetAllocatedLamports: totalAllocated.toString(),
      budgetSpentLamports: totalSpent.toString(),
      cpmLamports: task.campaignConfig.cpmLamports.toString(),
      minViews: task.campaignConfig.minViews,
      totalSubmissions,
      approved,
      paid,
      rejected,
      pending,
      totalViews,
    },
  })
}
