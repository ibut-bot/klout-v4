import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { verifyPaymentTx } from '@/lib/solana/verify-tx'

const SYSTEM_WALLET = process.env.SYSTEM_WALLET_ADDRESS || ''
const TASK_FEE_LAMPORTS = Number(process.env.TASK_FEE_LAMPORTS || 10000000) // 0.01 SOL default

/** GET /api/tasks -- list tasks */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')?.toUpperCase()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))
  const skip = (page - 1) * limit

  const where: any = {}
  if (status && ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED'].includes(status)) {
    where.status = status
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        creator: { select: { walletAddress: true } },
        _count: { select: { bids: true } },
      },
    }),
    prisma.task.count({ where }),
  ])

  return Response.json({
    success: true,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      budgetLamports: t.budgetLamports.toString(),
      status: t.status,
      creatorWallet: t.creator.walletAddress,
      bidCount: t._count.bids,
      createdAt: t.createdAt.toISOString(),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}

/** POST /api/tasks -- create a task */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { wallet, userId } = auth

  const rl = rateLimitResponse(`taskCreate:${wallet}`, RATE_LIMITS.taskCreate)
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

  const { title, description, budgetLamports, paymentTxSignature } = body
  if (!title || !description || !budgetLamports || !paymentTxSignature) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: title, description, budgetLamports, paymentTxSignature' },
      { status: 400 }
    )
  }

  if (typeof budgetLamports !== 'number' && typeof budgetLamports !== 'string') {
    return Response.json(
      { success: false, error: 'INVALID_BUDGET', message: 'budgetLamports must be a number' },
      { status: 400 }
    )
  }

  // Verify the payment transaction
  if (SYSTEM_WALLET) {
    const verification = await verifyPaymentTx(paymentTxSignature, SYSTEM_WALLET, TASK_FEE_LAMPORTS)
    if (!verification.valid) {
      return Response.json(
        { success: false, error: 'INVALID_PAYMENT', message: verification.error || 'Payment verification failed' },
        { status: 400 }
      )
    }
  }

  // Check for duplicate tx signature
  const existing = await prisma.task.findFirst({ where: { paymentTxSignature } })
  if (existing) {
    return Response.json(
      { success: false, error: 'DUPLICATE_TX', message: 'This payment transaction has already been used' },
      { status: 409 }
    )
  }

  const task = await prisma.task.create({
    data: {
      creatorId: userId,
      title,
      description,
      budgetLamports: BigInt(budgetLamports),
      paymentTxSignature,
    },
  })

  return Response.json({
    success: true,
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      budgetLamports: task.budgetLamports.toString(),
      status: task.status,
      createdAt: task.createdAt.toISOString(),
    },
  }, { status: 201 })
}
