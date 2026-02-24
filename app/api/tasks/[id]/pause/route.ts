import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/tasks/[id]/pause
 *
 * Toggle pause/resume on a campaign. Only the creator can do this.
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
      { success: false, error: 'FORBIDDEN', message: 'Only the campaign creator can pause/resume' },
      { status: 403 }
    )
  }

  if (task.taskType !== 'CAMPAIGN') {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'Only campaigns can be paused' },
      { status: 400 }
    )
  }

  if (action === 'pause') {
    if (task.status !== 'OPEN') {
      return Response.json(
        { success: false, error: 'INVALID_STATUS', message: 'Only OPEN campaigns can be paused' },
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
      { success: false, error: 'INVALID_STATUS', message: 'Only PAUSED campaigns can be resumed' },
      { status: 400 }
    )
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: 'OPEN' },
  })

  return Response.json({ success: true, status: 'OPEN' })
}
