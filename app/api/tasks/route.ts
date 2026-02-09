import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { verifyPaymentTx } from '@/lib/solana/verify-tx'

const SYSTEM_WALLET = process.env.SYSTEM_WALLET_ADDRESS
if (!SYSTEM_WALLET) {
  console.error('WARNING: SYSTEM_WALLET_ADDRESS is not set. Task creation will be rejected.')
}
const TASK_FEE_LAMPORTS = Number(process.env.TASK_FEE_LAMPORTS || 10000000) // 0.01 SOL default
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://slopwork.xyz'
const NETWORK = process.env.SOLANA_NETWORK || 'mainnet'
const EXPLORER_PREFIX = NETWORK === 'mainnet' ? 'https://solscan.io' : `https://solscan.io?cluster=${NETWORK}`

const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 10000

/** GET /api/tasks -- list tasks */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const status = searchParams.get('status')?.toUpperCase()
  const taskType = searchParams.get('taskType')?.toUpperCase()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))
  const skip = (page - 1) * limit

  const where: any = {}
  if (status && ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED'].includes(status)) {
    where.status = status
  }
  if (taskType && ['QUOTE', 'COMPETITION'].includes(taskType)) {
    where.taskType = taskType
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        creator: { select: { walletAddress: true, username: true, profilePicUrl: true } },
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
      taskType: t.taskType,
      status: t.status,
      creatorWallet: t.creator.walletAddress,
      creatorUsername: t.creator.username,
      creatorProfilePic: t.creator.profilePicUrl,
      bidCount: t._count.bids,
      createdAt: t.createdAt.toISOString(),
      url: `${APP_URL}/tasks/${t.id}`,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    network: NETWORK,
    explorerPrefix: EXPLORER_PREFIX,
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

  const { title, description, budgetLamports, paymentTxSignature, taskType } = body
  if (!title || !description || !budgetLamports || !paymentTxSignature) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: title, description, budgetLamports, paymentTxSignature' },
      { status: 400 }
    )
  }

  // Validate taskType if provided
  const validTaskTypes = ['QUOTE', 'COMPETITION']
  const resolvedTaskType = taskType ? String(taskType).toUpperCase() : 'QUOTE'
  if (!validTaskTypes.includes(resolvedTaskType)) {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'taskType must be QUOTE or COMPETITION' },
      { status: 400 }
    )
  }

  if (typeof title !== 'string' || title.trim().length === 0 || title.length > MAX_TITLE_LENGTH) {
    return Response.json(
      { success: false, error: 'INVALID_TITLE', message: `Title must be a non-empty string of at most ${MAX_TITLE_LENGTH} characters` },
      { status: 400 }
    )
  }

  if (typeof description !== 'string' || description.trim().length === 0 || description.length > MAX_DESCRIPTION_LENGTH) {
    return Response.json(
      { success: false, error: 'INVALID_DESCRIPTION', message: `Description must be a non-empty string of at most ${MAX_DESCRIPTION_LENGTH} characters` },
      { status: 400 }
    )
  }

  if (typeof budgetLamports !== 'number' && typeof budgetLamports !== 'string') {
    return Response.json(
      { success: false, error: 'INVALID_BUDGET', message: 'budgetLamports must be a number' },
      { status: 400 }
    )
  }

  let parsedBudget: bigint
  try {
    parsedBudget = BigInt(budgetLamports)
    if (parsedBudget <= BigInt(0)) throw new Error('non-positive')
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_BUDGET', message: 'budgetLamports must be a valid positive integer' },
      { status: 400 }
    )
  }

  // Verify the payment transaction -- SYSTEM_WALLET must be configured
  if (!SYSTEM_WALLET) {
    return Response.json(
      { success: false, error: 'SERVER_CONFIG_ERROR', message: 'System wallet is not configured. Task creation is disabled.' },
      { status: 503 }
    )
  }

  const verification = await verifyPaymentTx(paymentTxSignature, SYSTEM_WALLET, TASK_FEE_LAMPORTS)
  if (!verification.valid) {
    return Response.json(
      { success: false, error: 'INVALID_PAYMENT', message: verification.error || 'Payment verification failed' },
      { status: 400 }
    )
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
      title: title.trim(),
      description: description.trim(),
      budgetLamports: parsedBudget,
      taskType: resolvedTaskType as any,
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
      taskType: task.taskType,
      status: task.status,
      createdAt: task.createdAt.toISOString(),
      url: `${APP_URL}/tasks/${task.id}`,
    },
  }, { status: 201 })
}
