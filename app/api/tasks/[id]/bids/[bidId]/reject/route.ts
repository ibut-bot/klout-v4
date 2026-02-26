import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'

/** POST /api/tasks/:id/bids/:bidId/reject -- creator rejects a competition submission */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id, bidId } = await params

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.creatorId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the task creator can reject submissions' },
      { status: 403 }
    )
  }

  if (task.taskType !== 'COMPETITION') {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'This endpoint is only for COMPETITION tasks' },
      { status: 400 }
    )
  }

  if (!['OPEN', 'IN_PROGRESS'].includes(task.status)) {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Task is ${task.status}, can only reject on OPEN or IN_PROGRESS tasks` },
      { status: 400 }
    )
  }

  const bid = await prisma.bid.findUnique({ where: { id: bidId } })
  if (!bid || bid.taskId !== id) {
    return Response.json({ success: false, error: 'BID_NOT_FOUND', message: 'Bid not found for this task' }, { status: 404 })
  }

  if (bid.status !== 'PENDING') {
    return Response.json(
      { success: false, error: 'BID_NOT_PENDING', message: `Bid is ${bid.status}, can only reject PENDING bids` },
      { status: 400 }
    )
  }

  await prisma.$transaction([
    prisma.bid.update({
      where: { id: bidId },
      data: { status: 'REJECTED' },
    }),
    prisma.submission.updateMany({
      where: { bidId },
      data: { creatorRejected: true },
    }),
  ])

  createNotification({
    userId: bid.bidderId,
    type: 'BID_REJECTED',
    title: 'Submission rejected',
    body: `Your submission on "${task.title}" was rejected by the creator`,
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    message: 'Submission rejected',
    bidId,
  })
}
