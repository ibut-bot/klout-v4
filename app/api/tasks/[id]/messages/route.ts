import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

/** GET /api/tasks/:id/messages -- get messages for a task */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { wallet, userId } = auth
  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, walletAddress: true } },
      winningBid: { select: { bidderId: true, bidder: { select: { walletAddress: true } } } },
      bids: { select: { bidderId: true }, where: { bidderId: userId } },
    },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  // Access control
  const isCreator = task.creatorId === userId
  const isBidder = task.bids.length > 0
  const isWinningBidder = task.winningBid?.bidderId === userId

  // Must be creator or a bidder to see messages
  if (!isCreator && !isBidder) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only task creator and bidders can view messages' },
      { status: 403 }
    )
  }

  // After bid accepted, only creator and winning bidder
  if (task.winningBid && !isCreator && !isWinningBidder) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'After bid acceptance, only creator and winning bidder can view messages' },
      { status: 403 }
    )
  }

  const since = request.nextUrl.searchParams.get('since')
  const where: any = { taskId: id }
  if (since) {
    where.createdAt = { gt: new Date(since) }
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: { sender: { select: { walletAddress: true } } },
  })

  return Response.json({
    success: true,
    messages: messages.map((m) => ({
      id: m.id,
      senderWallet: m.sender.walletAddress,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  })
}

/** POST /api/tasks/:id/messages -- send a message */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { wallet, userId } = auth
  const { id } = await params

  const rl = rateLimitResponse(`message:${wallet}`, RATE_LIMITS.message)
  if (rl) return rl

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { content } = body
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: content (non-empty string)' },
      { status: 400 }
    )
  }

  if (content.length > 2000) {
    return Response.json(
      { success: false, error: 'CONTENT_TOO_LONG', message: 'Message content must be 2000 characters or less' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      winningBid: { select: { bidderId: true } },
      bids: { select: { bidderId: true }, where: { bidderId: userId } },
    },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  const isCreator = task.creatorId === userId
  const isBidder = task.bids.length > 0
  const isWinningBidder = task.winningBid?.bidderId === userId

  if (!isCreator && !isBidder) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only task creator and bidders can send messages' },
      { status: 403 }
    )
  }

  // After bid accepted, only creator and winning bidder
  if (task.winningBid && !isCreator && !isWinningBidder) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'After bid acceptance, only creator and winning bidder can message' },
      { status: 403 }
    )
  }

  const message = await prisma.message.create({
    data: {
      taskId: id,
      senderId: userId,
      content: content.trim(),
    },
  })

  return Response.json({
    success: true,
    message: {
      id: message.id,
      senderWallet: wallet,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    },
  }, { status: 201 })
}
