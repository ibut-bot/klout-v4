import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

/** GET /api/tasks/:id/submissions -- list all submissions for a task (creator or bidder only) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    include: { bids: { select: { bidderId: true } } },
  })
  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  // Only task creator and bidders on this task can view submissions
  const isCreator = task.creatorId === userId
  const isBidder = task.bids.some(b => b.bidderId === userId)
  if (!isCreator && !isBidder) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the task creator and bidders can view submissions' },
      { status: 403 }
    )
  }

  const submissions = await prisma.submission.findMany({
    where: { bid: { taskId: id } },
    orderBy: { createdAt: 'desc' },
    include: {
      bid: {
        select: {
          id: true,
          bidderId: true,
          amountLamports: true,
          multisigAddress: true,
          vaultAddress: true,
          proposalIndex: true,
          status: true,
          bidder: { select: { walletAddress: true, username: true, profilePicUrl: true } },
        },
      },
    },
  })

  return Response.json({
    success: true,
    taskType: task.taskType,
    submissions: submissions.map((s) => ({
      id: s.id,
      bidId: s.bidId,
      description: s.description,
      attachments: s.attachments,
      postUrl: s.postUrl,
      xPostId: s.xPostId,
      viewCount: s.viewCount,
      likeCount: s.likeCount,
      retweetCount: s.retweetCount,
      commentCount: s.commentCount,
      metricsReadAt: s.metricsReadAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      bid: {
        id: s.bid.id,
        bidderId: s.bid.bidderId,
        amountLamports: s.bid.amountLamports.toString(),
        multisigAddress: s.bid.multisigAddress,
        vaultAddress: s.bid.vaultAddress,
        proposalIndex: s.bid.proposalIndex,
        status: s.bid.status,
        bidderWallet: s.bid.bidder.walletAddress,
        bidderUsername: s.bid.bidder.username,
        bidderProfilePic: s.bid.bidder.profilePicUrl,
      },
    })),
  })
}
