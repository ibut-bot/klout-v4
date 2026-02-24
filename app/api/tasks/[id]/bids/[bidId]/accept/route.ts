import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'

/** POST /api/tasks/:id/bids/:bidId/accept -- accept a bid (task creator only) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id, bidId } = await params

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    // Body is optional for backward compatibility (single-winner)
  }
  const { winnerPlace } = body

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

  const isCompetition = task.taskType === 'COMPETITION'
  const isMultiWinner = isCompetition && task.maxWinners > 1

  // For multi-winner competitions, allow accepting while OPEN or IN_PROGRESS
  const allowedStatuses = isMultiWinner ? ['OPEN', 'IN_PROGRESS'] : ['OPEN']
  if (!allowedStatuses.includes(task.status)) {
    return Response.json(
      { success: false, error: 'INVALID_STATUS', message: `Task is ${task.status}, can only accept bids on ${allowedStatuses.join(' or ')} tasks` },
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

  if (isCompetition) {
    const submission = await prisma.submission.findFirst({ where: { bidId } })
    if (!submission) {
      return Response.json(
        { success: false, error: 'NO_SUBMISSION', message: 'Competition tasks require a submission before the bid can be accepted' },
        { status: 400 }
      )
    }
  }

  // Multi-winner: validate winnerPlace
  let resolvedPlace: number | null = null
  if (isMultiWinner) {
    resolvedPlace = Number(winnerPlace)
    if (!Number.isInteger(resolvedPlace) || resolvedPlace < 1 || resolvedPlace > task.maxWinners) {
      return Response.json(
        { success: false, error: 'INVALID_PLACE', message: `winnerPlace must be between 1 and ${task.maxWinners}` },
        { status: 400 }
      )
    }
    const existingWinner = await prisma.bid.findFirst({
      where: { taskId: id, winnerPlace: resolvedPlace },
    })
    if (existingWinner) {
      return Response.json(
        { success: false, error: 'PLACE_TAKEN', message: `Place ${resolvedPlace} has already been awarded` },
        { status: 400 }
      )
    }
  } else if (isCompetition) {
    resolvedPlace = 1
  }

  // Count how many winners already exist (for multi-winner)
  const existingWinnerCount = isMultiWinner
    ? await prisma.bid.count({ where: { taskId: id, winnerPlace: { not: null } } })
    : 0
  const isFirstWinner = existingWinnerCount === 0
  const isLastWinner = isMultiWinner && existingWinnerCount + 1 >= task.maxWinners

  const txOps: any[] = [
    prisma.bid.update({
      where: { id: bidId },
      data: {
        status: 'ACCEPTED',
        ...(resolvedPlace ? { winnerPlace: resolvedPlace } : {}),
      },
    }),
  ]

  if (isMultiWinner) {
    // Only reject remaining bids when all winner slots are filled
    if (isLastWinner) {
      txOps.push(
        prisma.bid.updateMany({
          where: { taskId: id, status: 'PENDING' },
          data: { status: 'REJECTED' },
        })
      )
    }
    const taskUpdate: any = {}
    if (isFirstWinner) taskUpdate.status = 'IN_PROGRESS'
    if (resolvedPlace === 1) taskUpdate.winningBidId = bidId
    if (isLastWinner && !isFirstWinner) {
      // Don't override status if already IN_PROGRESS -- it stays IN_PROGRESS,
      // task goes to COMPLETED after all payments are recorded in approve-payment
    }
    if (Object.keys(taskUpdate).length > 0) {
      txOps.push(prisma.task.update({ where: { id }, data: taskUpdate }))
    }
  } else {
    // Single winner: original behavior
    txOps.push(
      prisma.bid.updateMany({
        where: { taskId: id, status: 'PENDING', id: { not: bidId } },
        data: { status: 'REJECTED' },
      }),
      prisma.task.update({
        where: { id },
        data: { status: 'IN_PROGRESS', winningBidId: bidId },
      })
    )
  }

  await prisma.$transaction(txOps)

  // Get pending bids for rejection notifications (only when last winner)
  if (!isMultiWinner || isLastWinner) {
    const pendingBids = isLastWinner
      ? await prisma.bid.findMany({
          where: { taskId: id, status: 'REJECTED', winnerPlace: null },
          select: { bidderId: true },
        })
      : await prisma.bid.findMany({
          where: { taskId: id, status: 'REJECTED', id: { not: bidId } },
          select: { bidderId: true },
        })

    for (const rejected of pendingBids) {
      createNotification({
        userId: rejected.bidderId,
        type: 'BID_REJECTED',
        title: isCompetition ? 'Submission not selected' : 'Bid not selected',
        body: isCompetition
          ? `Another submission was selected for "${task.title}"`
          : `Another bid was selected for "${task.title}"`,
        linkUrl: `/tasks/${id}`,
      })
    }
  }

  const placeLabel = resolvedPlace
    ? resolvedPlace <= 3
      ? ['1st', '2nd', '3rd'][resolvedPlace - 1]
      : `${resolvedPlace}th`
    : null

  createNotification({
    userId: bid.bidderId,
    type: 'BID_ACCEPTED',
    title: isCompetition
      ? `Your submission won ${placeLabel} place!`
      : 'Your bid was accepted!',
    body: isCompetition
      ? `Your submission on "${task.title}" was selected as ${placeLabel} place winner`
      : `Your bid on "${task.title}" has been accepted`,
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    message: isCompetition
      ? `${placeLabel} place selected. Process payment to complete.`
      : 'Bid accepted. Task is now in progress.',
    bidId,
    winnerPlace: resolvedPlace,
    taskType: task.taskType,
    multisigAddress: bid.multisigAddress,
    vaultAddress: bid.vaultAddress,
    proposalIndex: bid.proposalIndex,
  })
}
