import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tasks/[id]/campaign-submissions
 * List all campaign submissions for a task.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { id: taskId } = await context.params

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, taskType: true, creatorId: true },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.taskType !== 'CAMPAIGN') {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'This endpoint is only for CAMPAIGN tasks' },
      { status: 400 }
    )
  }

  const isCreator = task.creatorId === auth.userId

  let isSharedViewer = false
  if (!isCreator) {
    const share = await prisma.campaignShare.findUnique({
      where: { taskId_sharedWithId: { taskId, sharedWithId: auth.userId } },
    })
    isSharedViewer = !!share
  }

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')?.toUpperCase()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))

  const where: any = { taskId }
  if (status) {
    where.status = status
  }
  if (!isCreator && !isSharedViewer) {
    where.submitterId = auth.userId
  }

  const [submissions, total] = await Promise.all([
    prisma.campaignSubmission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        submitter: {
          select: {
            id: true, walletAddress: true, username: true, xUsername: true, profilePicUrl: true,
            xScores: { orderBy: { createdAt: 'desc' }, take: 1, select: { totalScore: true } },
          },
        },
      },
    }),
    prisma.campaignSubmission.count({ where }),
  ])

  return Response.json({
    success: true,
    submissions: submissions.map((s) => ({
      id: s.id,
      postUrl: s.postUrl,
      xPostId: s.xPostId,
      viewCount: s.viewCount,
      viewsReadAt: s.viewsReadAt?.toISOString() || null,
      payoutLamports: s.payoutLamports?.toString() || null,
      status: s.status,
      rejectionReason: s.rejectionReason,
      contentCheckPassed: s.contentCheckPassed,
      contentCheckExplanation: s.contentCheckExplanation,
      paymentTxSig: s.paymentTxSig,
      submitterId: s.submitterId,
      submitter: {
        id: s.submitter.id,
        walletAddress: s.submitter.walletAddress,
        username: s.submitter.username,
        xUsername: s.submitter.xUsername,
        profilePicUrl: s.submitter.profilePicUrl,
        kloutScore: s.submitter.xScores[0]?.totalScore ?? null,
      },
      createdAt: s.createdAt.toISOString(),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}
