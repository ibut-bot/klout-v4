import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

/** POST /api/tasks/:id/bids/:bidId/accept -- accept a bid (task creator only) */
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
      { success: false, error: 'FORBIDDEN', message: 'Only task creator can accept bids' },
      { status: 403 }
    )
  }

  if (task.status !== 'OPEN') {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Task is ${task.status}, can only accept bids on OPEN tasks` },
      { status: 400 }
    )
  }

  const bid = await prisma.bid.findUnique({ where: { id: bidId } })
  if (!bid || bid.taskId !== id) {
    return Response.json({ success: false, error: 'BID_NOT_FOUND', message: 'Bid not found for this task' }, { status: 404 })
  }

  if (bid.status !== 'PENDING') {
    return Response.json(
      { success: false, error: 'BID_NOT_PENDING', message: `Bid is ${bid.status}, can only accept PENDING bids` },
      { status: 400 }
    )
  }

  await prisma.$transaction([
    // Accept this bid
    prisma.bid.update({ where: { id: bidId }, data: { status: 'ACCEPTED' } }),
    // Reject all other pending bids
    prisma.bid.updateMany({
      where: { taskId: id, status: 'PENDING', id: { not: bidId } },
      data: { status: 'REJECTED' },
    }),
    // Update task
    prisma.task.update({
      where: { id },
      data: { status: 'IN_PROGRESS', winningBidId: bidId },
    }),
  ])

  return Response.json({
    success: true,
    message: 'Bid accepted. Task is now in progress.',
    bidId,
    multisigAddress: bid.multisigAddress,
    vaultAddress: bid.vaultAddress,
  })
}
