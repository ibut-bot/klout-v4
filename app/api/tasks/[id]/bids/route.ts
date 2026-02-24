import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { createNotification } from '@/lib/notifications'

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
    include: {
      bidder: { select: { walletAddress: true, username: true, profilePicUrl: true } },
      submissions: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  return Response.json({
    success: true,
    taskType: task.taskType,
    bids: bids.map((b) => ({
      id: b.id,
      bidderId: b.bidderId,
      bidderWallet: b.bidder.walletAddress,
      bidderUsername: b.bidder.username,
      bidderProfilePic: b.bidder.profilePicUrl,
      amountLamports: b.amountLamports.toString(),
      description: b.description,
      multisigAddress: b.multisigAddress,
      vaultAddress: b.vaultAddress,
      proposalIndex: b.proposalIndex,
      status: b.status,
      winnerPlace: b.winnerPlace,
      hasSubmission: b.submissions.length > 0,
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

  if (typeof description !== 'string' || description.trim().length === 0 || description.length > 5000) {
    return Response.json(
      { success: false, error: 'INVALID_DESCRIPTION', message: 'description must be a non-empty string of at most 5000 characters' },
      { status: 400 }
    )
  }

  // Sanity check: reject absurd amounts (> 1 billion SOL worth of lamports)
  // This catches double-conversion bugs where lamports are multiplied by LAMPORTS_PER_SOL twice
  const MAX_LAMPORTS = BigInt('1000000000000000000') // 1 billion SOL in lamports
  let parsedLamports: bigint
  try {
    parsedLamports = BigInt(amountLamports)
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_AMOUNT', message: 'amountLamports must be a valid integer' },
      { status: 400 }
    )
  }
  if (parsedLamports <= BigInt(0)) {
    return Response.json(
      { success: false, error: 'INVALID_AMOUNT', message: 'amountLamports must be positive' },
      { status: 400 }
    )
  }
  if (parsedLamports > MAX_LAMPORTS) {
    return Response.json(
      { success: false, error: 'INVALID_AMOUNT', message: `amountLamports looks too large (${amountLamports}). Make sure you are passing lamports, not SOL. 1 SOL = 1,000,000,000 lamports.` },
      { status: 400 }
    )
  }

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  // Bid amount must not exceed the task budget
  if (parsedLamports > task.budgetLamports) {
    return Response.json(
      { success: false, error: 'BID_EXCEEDS_BUDGET', message: `Bid amount (${parsedLamports.toString()} lamports) exceeds task budget (${task.budgetLamports.toString()} lamports). This may indicate a SOL/lamports unit mismatch.` },
      { status: 400 }
    )
  }

  if (task.status !== 'OPEN') {
    return Response.json(
      { success: false, error: 'TASK_NOT_OPEN', message: `Task is ${task.status}, not accepting bids` },
      { status: 400 }
    )
  }

  if (task.creatorId === userId) {
    return Response.json(
      { success: false, error: 'SELF_BID', message: 'Cannot bid on your own campaign' },
      { status: 400 }
    )
  }

  // Check for duplicate bid from same user
  const existingBid = await prisma.bid.findFirst({
    where: { taskId: id, bidderId: userId, status: 'PENDING' },
  })
  if (existingBid) {
    return Response.json(
      { success: false, error: 'DUPLICATE_BID', message: 'You already have a pending bid on this campaign' },
      { status: 409 }
    )
  }

  const bid = await prisma.bid.create({
    data: {
      taskId: id,
      bidderId: userId,
      amountLamports: parsedLamports,
      description,
      multisigAddress: multisigAddress || null,
      vaultAddress: vaultAddress || null,
    },
  })

  // Notify task creator about the new bid
  const solAmount = (Number(parsedLamports) / 1e9).toFixed(4)
  createNotification({
    userId: task.creatorId,
    type: 'NEW_BID',
    title: 'New bid on your campaign',
    body: `Someone bid ${solAmount} SOL on "${task.title}"`,
    linkUrl: `/tasks/${id}`,
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
