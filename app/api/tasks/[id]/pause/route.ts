import { NextRequest } from 'next/server'
import { TaskStatus } from '@/app/generated/prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/tasks/[id]/pause
 *
 * Toggle pause/resume on a campaign or competition. Only the creator can do this.
 * Body: { action: 'pause' | 'resume' }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const { id: taskId } = await context.params

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { action } = body
  if (!action || !['pause', 'resume'].includes(action)) {
    return Response.json(
      { success: false, error: 'INVALID_ACTION', message: 'action must be "pause" or "resume"' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { creatorId: true, taskType: true, status: true },
  })

  if (!task) {
    return Response.json(
      { success: false, error: 'NOT_FOUND', message: 'Task not found' },
      { status: 404 }
    )
  }

  if (task.creatorId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the creator can pause/resume' },
      { status: 403 }
    )
  }

  const allowedTypes = ['CAMPAIGN', 'COMPETITION']
  if (!allowedTypes.includes(task.taskType)) {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'Only campaigns and competitions can be paused' },
      { status: 400 }
    )
  }

  const typeLabel = task.taskType === 'COMPETITION' ? 'competition' : 'campaign'

  if (action === 'pause') {
    const pausableStatuses = task.taskType === 'COMPETITION' ? ['OPEN', 'IN_PROGRESS'] : ['OPEN']
    if (!pausableStatuses.includes(task.status)) {
      return Response.json(
        { success: false, error: 'INVALID_STATUS', message: `Only ${pausableStatuses.join(' or ')} ${typeLabel}s can be paused` },
        { status: 400 }
      )
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'PAUSED' },
    })

    return Response.json({ success: true, status: 'PAUSED' })
  }

  // action === 'resume'
  if (task.status !== 'PAUSED') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Only PAUSED ${typeLabel}s can be resumed` },
      { status: 400 }
    )
  }

  // For competitions, check if winners were already selected → resume to IN_PROGRESS
  let resumeStatus: TaskStatus = 'OPEN'
  if (task.taskType === 'COMPETITION') {
    const winnersCount = await prisma.bid.count({
      where: { taskId, winnerPlace: { not: null } },
    })
    if (winnersCount > 0) resumeStatus = 'IN_PROGRESS'
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: resumeStatus },
  })

  return Response.json({ success: true, status: resumeStatus })
}
