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
  const sortBy = searchParams.get('sortBy')
  const sortDir: 'asc' | 'desc' = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

  const where: any = { taskId }
  if (status) {
    where.status = status
  }
  const searchPostId = searchParams.get('postId')
  if (searchPostId) {
    where.xPostId = { contains: searchPostId }
  }
  const filterSubmitterId = searchParams.get('submitterId')
  if (!isCreator && !isSharedViewer) {
    where.submitterId = auth.userId
  } else if (filterSubmitterId) {
    where.submitterId = filterSubmitterId
  }

  const submitterInclude = {
    submitter: {
      select: {
        id: true, walletAddress: true, username: true, xUsername: true, profilePicUrl: true,
        xScores: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { totalScore: true } },
      },
    },
  }

  let submissions: any[]
  let total: number

  if (sortBy === 'score') {
    let query = `
      SELECT cs."id"
      FROM slopwork."CampaignSubmission" cs
      LEFT JOIN LATERAL (
        SELECT "totalScore" FROM slopwork."XScoreData"
        WHERE "userId" = cs."submitterId"
        ORDER BY "createdAt" DESC
        LIMIT 1
      ) xs ON true
      WHERE cs."taskId" = $1`
    const params: (string | number)[] = [taskId]
    let idx = 2

    if (status) {
      query += ` AND cs."status" = $${idx}`
      params.push(status)
      idx++
    }
    if (searchPostId) {
      query += ` AND cs."xPostId" LIKE '%' || $${idx} || '%'`
      params.push(searchPostId)
      idx++
    }
    if (!isCreator && !isSharedViewer) {
      query += ` AND cs."submitterId" = $${idx}`
      params.push(auth.userId)
      idx++
    } else if (filterSubmitterId) {
      query += ` AND cs."submitterId" = $${idx}`
      params.push(filterSubmitterId)
      idx++
    }

    query += ` ORDER BY xs."totalScore" ${sortDir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`
    query += ` LIMIT $${idx} OFFSET $${idx + 1}`
    params.push(limit, (page - 1) * limit)

    const sortedIds = await prisma.$queryRawUnsafe<{ id: string }[]>(query, ...params)

    const ids = sortedIds.map(r => r.id)
    const [records, count] = await Promise.all([
      ids.length > 0
        ? prisma.campaignSubmission.findMany({ where: { id: { in: ids } }, include: submitterInclude })
        : Promise.resolve([]),
      prisma.campaignSubmission.count({ where }),
    ])
    const idOrder = new Map(ids.map((id, i) => [id, i]))
    submissions = records.sort((a: any, b: any) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0))
    total = count
  } else {
    let orderBy: any = { createdAt: 'desc' }
    if (sortBy === 'submitter') orderBy = [{ submitter: { xUsername: sortDir } }, { createdAt: 'desc' }]
    else if (sortBy === 'views') orderBy = { viewCount: sortDir }
    else if (sortBy === 'payout') orderBy = { payoutLamports: sortDir }
    else if (sortBy === 'status') orderBy = { status: sortDir }
    else if (sortBy === 'date') orderBy = { createdAt: sortDir }

    const [records, count] = await Promise.all([
      prisma.campaignSubmission.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: submitterInclude,
      }),
      prisma.campaignSubmission.count({ where }),
    ])
    submissions = records
    total = count
  }

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
      paymentRequestId: s.paymentRequestId,
      submitterId: s.submitterId,
      submitter: {
        id: s.submitter.id,
        walletAddress: s.submitter.walletAddress,
        username: s.submitter.username,
        xUsername: s.submitter.xUsername,
        profilePicUrl: s.submitter.profilePicUrl,
        kloutScore: s.submitter.xScores[0]?.totalScore ?? null,
      },
      cpmMultiplierApplied: s.cpmMultiplierApplied ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}
