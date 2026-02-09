import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { createNotification } from '@/lib/notifications'
import { verifyPaymentTx } from '@/lib/solana/verify-tx'

const SYSTEM_WALLET = process.env.SYSTEM_WALLET_ADDRESS
const COMPETITION_ENTRY_FEE_LAMPORTS = Number(process.env.COMPETITION_ENTRY_FEE_LAMPORTS || 1000000) // 0.001 SOL default

/**
 * POST /api/tasks/:id/compete
 *
 * Combined bid + submission endpoint for competition mode.
 * Creates a bid and submission atomically in one API call.
 * Requires a small on-chain fee payment (0.001 SOL) for spam prevention.
 *
 * Body:
 *   description      - Submission description (also used as bid description)
 *   attachments?     - Array of attachment objects
 *   entryFeeTxSignature - On-chain tx signature for the entry fee payment
 *
 * Note: amountLamports is automatically set to the task's budgetLamports.
 *       Participants do not specify an amount — the competition budget is fixed by the creator.
 */
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

  const { description, attachments, entryFeeTxSignature } = body

  // --- Validate required fields ---
  if (!description || !entryFeeTxSignature) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: description, entryFeeTxSignature' },
      { status: 400 }
    )
  }

  if (typeof description !== 'string' || description.trim().length === 0 || description.length > 10000) {
    return Response.json(
      { success: false, error: 'INVALID_DESCRIPTION', message: 'description must be a non-empty string of at most 10000 characters' },
      { status: 400 }
    )
  }

  // --- Validate task ---
  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }
  if (task.taskType !== 'COMPETITION') {
    return Response.json(
      { success: false, error: 'WRONG_TASK_TYPE', message: 'This endpoint is only for COMPETITION tasks. Use POST /api/tasks/:id/bids for QUOTE tasks.' },
      { status: 400 }
    )
  }
  if (task.status !== 'OPEN') {
    return Response.json(
      { success: false, error: 'TASK_NOT_OPEN', message: `Task is ${task.status}, not accepting entries` },
      { status: 400 }
    )
  }
  if (task.creatorId === userId) {
    return Response.json(
      { success: false, error: 'SELF_BID', message: 'Cannot enter your own competition' },
      { status: 400 }
    )
  }

  // Check for duplicate entry
  const existingBid = await prisma.bid.findFirst({
    where: { taskId: id, bidderId: userId },
  })
  if (existingBid) {
    return Response.json(
      { success: false, error: 'DUPLICATE_ENTRY', message: 'You have already submitted an entry for this competition' },
      { status: 409 }
    )
  }

  // Verify entry fee payment
  if (!SYSTEM_WALLET) {
    return Response.json(
      { success: false, error: 'SERVER_CONFIG_ERROR', message: 'System wallet is not configured' },
      { status: 503 }
    )
  }

  const feeVerification = await verifyPaymentTx(entryFeeTxSignature, SYSTEM_WALLET, COMPETITION_ENTRY_FEE_LAMPORTS)
  if (!feeVerification.valid) {
    return Response.json(
      { success: false, error: 'INVALID_ENTRY_FEE', message: feeVerification.error || 'Entry fee payment verification failed' },
      { status: 400 }
    )
  }

  // Validate attachments
  let parsedAttachments = null
  if (attachments) {
    if (!Array.isArray(attachments)) {
      return Response.json(
        { success: false, error: 'INVALID_ATTACHMENTS', message: 'attachments must be an array' },
        { status: 400 }
      )
    }
    if (attachments.length > 20) {
      return Response.json(
        { success: false, error: 'TOO_MANY_ATTACHMENTS', message: 'Maximum 20 attachments' },
        { status: 400 }
      )
    }
    parsedAttachments = attachments
  }

  // --- Create bid + submission atomically ---
  const [bid, submission] = await prisma.$transaction(async (tx) => {
    const bid = await tx.bid.create({
      data: {
        taskId: id,
        bidderId: userId,
        amountLamports: task.budgetLamports,
        description: description.trim(),
      },
    })

    const submission = await tx.submission.create({
      data: {
        bidId: bid.id,
        description: description.trim(),
        ...(parsedAttachments ? { attachments: parsedAttachments } : {}),
      },
    })

    return [bid, submission] as const
  })

  // Notify task creator
  const solAmount = (Number(task.budgetLamports) / 1e9).toFixed(4)
  createNotification({
    userId: task.creatorId,
    type: 'SUBMISSION_RECEIVED',
    title: 'New competition entry',
    body: `Someone submitted work for "${task.title}" (${solAmount} SOL)`,
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    bid: {
      id: bid.id,
      taskId: bid.taskId,
      amountLamports: bid.amountLamports.toString(),
      description: bid.description,
      status: bid.status,
      createdAt: bid.createdAt.toISOString(),
    },
    submission: {
      id: submission.id,
      bidId: submission.bidId,
      description: submission.description,
      attachments: submission.attachments,
      createdAt: submission.createdAt.toISOString(),
    },
    message: 'Competition entry submitted. Waiting for task creator to pick a winner.',
  }, { status: 201 })
}
