import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

/** GET /api/tasks/:id/bids -- list bids for a task */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  const bids = await prisma.bid.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'desc' },
    include: { bidder: { select: { walletAddress: true } } },
  })

  return Response.json({
    success: true,
    bids: bids.map((b) => ({
      id: b.id,
      bidderWallet: b.bidder.walletAddress,
      amountLamports: b.amountLamports.toString(),
      description: b.description,
      multisigAddress: b.multisigAddress,
      vaultAddress: b.vaultAddress,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    })),
  })
}

/** POST /api/tasks/:id/bids -- submit a bid */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { wallet, userId } = auth
  const { id } = await params

  const rl = rateLimitResponse(`bidCreate:${wallet}`, RATE_LIMITS.bidCreate)
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

  const { amountLamports, description, multisigAddress, vaultAddress } = body
  if (!amountLamports || !description) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: amountLamports, description' },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.status !== 'OPEN') {
    return Response.json(
      { success: false, error: 'TASK_NOT_OPEN', message: `Task is ${task.status}, not accepting bids` },
      { status: 400 }
    )
  }

  if (task.creatorId === userId) {
    return Response.json(
      { success: false, error: 'SELF_BID', message: 'Cannot bid on your own task' },
      { status: 400 }
    )
  }

  // Check for duplicate bid from same user
  const existingBid = await prisma.bid.findFirst({
    where: { taskId: id, bidderId: userId, status: 'PENDING' },
  })
  if (existingBid) {
    return Response.json(
      { success: false, error: 'DUPLICATE_BID', message: 'You already have a pending bid on this task' },
      { status: 409 }
    )
  }

  const bid = await prisma.bid.create({
    data: {
      taskId: id,
      bidderId: userId,
      amountLamports: BigInt(amountLamports),
      description,
      multisigAddress: multisigAddress || null,
      vaultAddress: vaultAddress || null,
    },
  })

  return Response.json({
    success: true,
    bid: {
      id: bid.id,
      taskId: bid.taskId,
      amountLamports: bid.amountLamports.toString(),
      description: bid.description,
      multisigAddress: bid.multisigAddress,
      vaultAddress: bid.vaultAddress,
      status: bid.status,
      createdAt: bid.createdAt.toISOString(),
    },
  }, { status: 201 })
}
