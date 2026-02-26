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
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://klout.gg'
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
  if (taskType && ['QUOTE', 'COMPETITION', 'CAMPAIGN'].includes(taskType)) {
    where.taskType = taskType
  } else {
    where.taskType = { in: ['CAMPAIGN', 'COMPETITION'] }
  }
  const includesCampaigns = !taskType || taskType === 'CAMPAIGN'
  if (status && ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED', 'PAUSED'].includes(status)) {
    if (includesCampaigns) {
      if (status === 'COMPLETED') {
        where.OR = [
          { status: 'COMPLETED' },
          { taskType: 'CAMPAIGN', campaignConfig: { budgetRemainingLamports: { lte: 0 } } },
        ]
      } else if (status === 'OPEN') {
        where.AND = [
          { status: 'OPEN' },
          {
            OR: [
              { taskType: { not: 'CAMPAIGN' } },
              { campaignConfig: { budgetRemainingLamports: { gt: 0 } } },
            ],
          },
        ]
      } else {
        where.status = status
      }
    } else {
      where.status = status
    }
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        creator: { select: { walletAddress: true, username: true, profilePicUrl: true } },
        _count: { select: { bids: true, campaignSubmissions: true } },
        campaignConfig: { select: { budgetRemainingLamports: true, heading: true, minKloutScore: true } },
        bids: {
          where: { winnerPlace: { not: null } },
          select: { winnerPlace: true, status: true, bidder: { select: { username: true, walletAddress: true } } },
          orderBy: { winnerPlace: 'asc' },
        },
      },
    }),
    prisma.task.count({ where }),
  ])

  const body = Response.json({
    success: true,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      budgetLamports: t.budgetLamports.toString(),
      taskType: t.taskType,
      platform: t.platform,
      paymentToken: t.paymentToken,
      customTokenMint: t.customTokenMint,
      customTokenSymbol: t.customTokenSymbol,
      customTokenDecimals: t.customTokenDecimals,
      customTokenLogoUri: t.customTokenLogoUri,
      status: t.taskType === 'CAMPAIGN' && t.status === 'OPEN' && t.campaignConfig && t.campaignConfig.budgetRemainingLamports <= 0 ? 'COMPLETED' : t.status,
      creatorWallet: t.creator.walletAddress,
      creatorUsername: t.creator.username,
      creatorProfilePic: t.creator.profilePicUrl,
      bidCount: t._count.bids,
      submissionCount: t._count.campaignSubmissions,
      budgetRemainingLamports: t.campaignConfig?.budgetRemainingLamports?.toString() || null,
      heading: t.campaignConfig?.heading || null,
      minKloutScore: t.campaignConfig?.minKloutScore ?? null,
      imageUrl: t.imageUrl,
      imageTransform: t.imageTransform,
      maxWinners: t.maxWinners,
      prizeStructure: t.prizeStructure,
      competitionWinners: t.taskType === 'COMPETITION' ? t.bids
        .filter(b => b.winnerPlace != null)
        .map(b => ({
          place: b.winnerPlace!,
          status: b.status,
          bidderUsername: b.bidder.username,
          bidderWallet: b.bidder.walletAddress,
        })) : undefined,
      deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
      totalViews: t.taskType === 'CAMPAIGN' ? t._count.campaignSubmissions : null,
      url: `${APP_URL}/tasks/${t.id}`,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    network: NETWORK,
    explorerPrefix: EXPLORER_PREFIX,
  })
  body.headers.set('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
  return body
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

  const { title, description, budgetLamports, paymentTxSignature, taskType, multisigAddress, vaultAddress, durationDays, cpmLamports, guidelines, imageUrl, imageTransform, minViews, minLikes, minRetweets, minComments, minPayoutLamports, maxBudgetPerUserPercent, maxBudgetPerPostPercent, minKloutScore, requireFollowX, heading, collateralLink, paymentToken, customTokenMint, customTokenSymbol, customTokenDecimals, customTokenLogoUri, bonusMinKloutScore, bonusMaxLamports, maxWinners, prizeStructure, isPublicFeed, platform, allowPreLivePosts } = body

  // Validate taskType early so we know which fields to require
  const validTaskTypes = ['QUOTE', 'COMPETITION', 'CAMPAIGN']
  const resolvedTaskType = taskType ? String(taskType).toUpperCase() : 'QUOTE'
  if (!validTaskTypes.includes(resolvedTaskType)) {
    return Response.json(
      { success: false, error: 'INVALID_TASK_TYPE', message: 'taskType must be QUOTE, COMPETITION, or CAMPAIGN' },
      { status: 400 }
    )
  }

  const isCompetition = resolvedTaskType === 'COMPETITION'
  const isCampaign = resolvedTaskType === 'CAMPAIGN'

  const validPlatforms = ['X', 'YOUTUBE']
  const resolvedPlatform = platform ? String(platform).toUpperCase() : 'X'
  if (!validPlatforms.includes(resolvedPlatform)) {
    return Response.json(
      { success: false, error: 'INVALID_PLATFORM', message: 'platform must be X or YOUTUBE' },
      { status: 400 }
    )
  }

  // Validate paymentToken (for CAMPAIGN and COMPETITION, defaults to SOL)
  const validTokens = ['SOL', 'USDC', 'CUSTOM']
  const resolvedPaymentToken = (isCampaign || isCompetition) && paymentToken ? String(paymentToken).toUpperCase() : 'SOL'
  if (!validTokens.includes(resolvedPaymentToken)) {
    return Response.json(
      { success: false, error: 'INVALID_PAYMENT_TOKEN', message: 'paymentToken must be SOL, USDC, or CUSTOM' },
      { status: 400 }
    )
  }

  // CUSTOM token requires mint, symbol, and decimals
  if (resolvedPaymentToken === 'CUSTOM') {
    if (!customTokenMint || typeof customTokenMint !== 'string' || customTokenMint.length < 32) {
      return Response.json(
        { success: false, error: 'MISSING_FIELDS', message: 'CUSTOM paymentToken requires a valid customTokenMint address' },
        { status: 400 }
      )
    }
    if (!customTokenSymbol || typeof customTokenSymbol !== 'string') {
      return Response.json(
        { success: false, error: 'MISSING_FIELDS', message: 'CUSTOM paymentToken requires customTokenSymbol' },
        { status: 400 }
      )
    }
    if (customTokenDecimals === undefined || customTokenDecimals === null || !Number.isInteger(Number(customTokenDecimals)) || Number(customTokenDecimals) < 0 || Number(customTokenDecimals) > 18) {
      return Response.json(
        { success: false, error: 'MISSING_FIELDS', message: 'CUSTOM paymentToken requires customTokenDecimals (integer 0-18)' },
        { status: 400 }
      )
    }
  }

  if (!title || !description || !budgetLamports || !paymentTxSignature) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: title, description, budgetLamports, paymentTxSignature' },
      { status: 400 }
    )
  }

  // Competition and Campaign tasks require vault details
  if ((isCompetition || isCampaign) && (!multisigAddress || !vaultAddress)) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: `${resolvedTaskType} tasks also require: multisigAddress, vaultAddress` },
      { status: 400 }
    )
  }

  // Campaign tasks require CPM and guidelines
  if (isCampaign) {
    if (!cpmLamports) {
      return Response.json(
        { success: false, error: 'MISSING_FIELDS', message: 'CAMPAIGN tasks require: cpmLamports' },
        { status: 400 }
      )
    }
    const parsedCpm = Number(cpmLamports)
    if (!Number.isFinite(parsedCpm) || parsedCpm <= 0) {
      return Response.json(
        { success: false, error: 'INVALID_CPM', message: 'cpmLamports must be a positive number' },
        { status: 400 }
      )
    }
    if (!guidelines || typeof guidelines !== 'object') {
      return Response.json(
        { success: false, error: 'MISSING_FIELDS', message: 'CAMPAIGN tasks require: guidelines ({ dos: string[], donts: string[] })' },
        { status: 400 }
      )
    }
    if (!Array.isArray(guidelines.dos) || !Array.isArray(guidelines.donts)) {
      return Response.json(
        { success: false, error: 'INVALID_GUIDELINES', message: 'guidelines must have dos and donts arrays' },
        { status: 400 }
      )
    }
  }

  // Validate competition prize structure
  let resolvedMaxWinners = 1
  let resolvedPrizeStructure: { place: number; amountLamports: string }[] | null = null
  if (isCompetition) {
    if (maxWinners !== undefined && maxWinners !== null) {
      resolvedMaxWinners = Number(maxWinners)
      if (!Number.isInteger(resolvedMaxWinners) || resolvedMaxWinners < 1 || resolvedMaxWinners > 10) {
        return Response.json(
          { success: false, error: 'INVALID_MAX_WINNERS', message: 'maxWinners must be an integer between 1 and 10' },
          { status: 400 }
        )
      }
    }
    if (resolvedMaxWinners > 1) {
      if (!Array.isArray(prizeStructure) || prizeStructure.length !== resolvedMaxWinners) {
        return Response.json(
          { success: false, error: 'INVALID_PRIZE_STRUCTURE', message: `prizeStructure must be an array with exactly ${resolvedMaxWinners} entries` },
          { status: 400 }
        )
      }
      let prizeSum = BigInt(0)
      for (let i = 0; i < prizeStructure.length; i++) {
        const entry = prizeStructure[i]
        if (!entry || entry.place !== i + 1) {
          return Response.json(
            { success: false, error: 'INVALID_PRIZE_STRUCTURE', message: `prizeStructure entry ${i} must have place=${i + 1}` },
            { status: 400 }
          )
        }
        try {
          const amt = BigInt(entry.amountLamports)
          if (amt <= BigInt(0)) throw new Error('non-positive')
          prizeSum += amt
        } catch {
          return Response.json(
            { success: false, error: 'INVALID_PRIZE_STRUCTURE', message: `prizeStructure entry ${i} must have a positive amountLamports` },
            { status: 400 }
          )
        }
      }
      if (prizeSum !== BigInt(budgetLamports)) {
        return Response.json(
          { success: false, error: 'PRIZE_BUDGET_MISMATCH', message: 'Sum of prize amounts must equal budgetLamports' },
          { status: 400 }
        )
      }
      resolvedPrizeStructure = prizeStructure.map((e: any) => ({ place: e.place, amountLamports: String(e.amountLamports) }))
    }
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

  // Verify the payment/funding transaction
  if (isCompetition || isCampaign) {
    // Competition tasks: no platform fee, but verify the tx exists and is confirmed on-chain
    // The paymentTxSignature is the vault creation + funding transaction
    const { getConnection } = await import('@/lib/solana/connection')
    const connection = getConnection()
    try {
      const tx = await connection.getParsedTransaction(paymentTxSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      })
      if (!tx) {
        return Response.json(
          { success: false, error: 'TX_NOT_FOUND', message: 'Vault creation transaction not found or not confirmed on-chain' },
          { status: 400 }
        )
      }
      if (tx.meta?.err) {
        return Response.json(
          { success: false, error: 'TX_FAILED', message: 'Vault creation transaction failed on-chain' },
          { status: 400 }
        )
      }
    } catch (e: any) {
      return Response.json(
        { success: false, error: 'TX_VERIFY_ERROR', message: e.message || 'Failed to verify vault creation transaction' },
        { status: 400 }
      )
    }
  } else {
    // Quote tasks: verify fee payment to system wallet
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
  }

  // Validate optional durationDays (competition only)
  let deadlineAt: Date | null = null
  if (durationDays !== undefined && durationDays !== null) {
    if (!isCompetition && !isCampaign) {
      return Response.json(
        { success: false, error: 'INVALID_FIELD', message: 'durationDays is only supported for COMPETITION and CAMPAIGN tasks' },
        { status: 400 }
      )
    }
    const days = Number(durationDays)
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return Response.json(
        { success: false, error: 'INVALID_DURATION', message: 'durationDays must be an integer between 1 and 365' },
        { status: 400 }
      )
    }
    deadlineAt = new Date(Date.now() + days * 86400000)
  }

  // Check for duplicate tx signature
  const existing = await prisma.task.findFirst({ where: { paymentTxSignature } })
  if (existing) {
    return Response.json(
      { success: false, error: 'DUPLICATE_TX', message: 'This payment transaction has already been used' },
      { status: 409 }
    )
  }

  // Use a transaction for campaign tasks to create both Task + CampaignConfig atomically
  if (isCampaign) {
    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          creatorId: userId,
          title: title.trim(),
          description: description.trim(),
          budgetLamports: parsedBudget,
          taskType: 'CAMPAIGN',
          platform: resolvedPlatform as any,
          paymentToken: resolvedPaymentToken as any,
          ...(resolvedPaymentToken === 'CUSTOM' ? {
            customTokenMint: customTokenMint,
            customTokenSymbol: customTokenSymbol,
            customTokenDecimals: Number(customTokenDecimals),
            ...(customTokenLogoUri ? { customTokenLogoUri: String(customTokenLogoUri) } : {}),
          } : {}),
          paymentTxSignature,
          multisigAddress,
          vaultAddress,
          ...(deadlineAt ? { deadlineAt } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          ...(imageTransform ? { imageTransform } : {}),
          allowPreLivePosts: !!allowPreLivePosts,
        },
      })

      await tx.campaignConfig.create({
        data: {
          taskId: task.id,
          cpmLamports: BigInt(cpmLamports),
          budgetRemainingLamports: parsedBudget,
          guidelines: {
            dos: guidelines.dos.map((d: string) => String(d).trim()).filter(Boolean),
            donts: guidelines.donts.map((d: string) => String(d).trim()).filter(Boolean),
          },
          ...(heading ? { heading: String(heading).trim() } : {}),
          ...(minViews !== undefined ? { minViews: Math.max(0, parseInt(minViews) || 100) } : {}),
          ...(minLikes !== undefined ? { minLikes: Math.max(0, parseInt(minLikes) || 0) } : {}),
          ...(minRetweets !== undefined ? { minRetweets: Math.max(0, parseInt(minRetweets) || 0) } : {}),
          ...(minComments !== undefined ? { minComments: Math.max(0, parseInt(minComments) || 0) } : {}),
          ...(minPayoutLamports !== undefined ? { minPayoutLamports: BigInt(Math.max(0, Number(minPayoutLamports) || 0)) } : {}),
          ...(maxBudgetPerUserPercent != null && Number(maxBudgetPerUserPercent) > 0 ? { maxBudgetPerUserPercent: Math.max(1, Math.min(100, Number(maxBudgetPerUserPercent))) } : {}),
          ...(maxBudgetPerPostPercent != null && Number(maxBudgetPerPostPercent) > 0 ? { maxBudgetPerPostPercent: Math.max(0.1, Math.min(100, Number(maxBudgetPerPostPercent))) } : {}),
          ...(minKloutScore != null && Number(minKloutScore) > 0 ? { minKloutScore: Math.max(1, Math.min(10000, Math.round(Number(minKloutScore)))) } : {}),
          ...(requireFollowX ? { requireFollowX: String(requireFollowX).trim().replace(/^@/, '') } : {}),
          ...(collateralLink ? { collateralLink: String(collateralLink).trim() } : {}),
          ...(bonusMinKloutScore != null && Number(bonusMinKloutScore) > 0 && bonusMaxLamports != null && Number(bonusMaxLamports) > 0 ? {
            bonusMinKloutScore: Math.max(1, Math.min(10000, Math.round(Number(bonusMinKloutScore)))),
            bonusMaxLamports: BigInt(Math.max(1, Math.round(Number(bonusMaxLamports)))),
          } : {}),
        },
      })

      return task
    })

    return Response.json({
      success: true,
      task: {
        id: result.id,
        title: result.title,
        description: result.description,
        budgetLamports: result.budgetLamports.toString(),
        taskType: result.taskType,
        status: result.status,
        deadlineAt: result.deadlineAt ? result.deadlineAt.toISOString() : null,
        createdAt: result.createdAt.toISOString(),
        url: `${APP_URL}/tasks/${result.id}`,
      },
    }, { status: 201 })
  }

  const task = await prisma.task.create({
    data: {
      creatorId: userId,
      title: title.trim(),
      description: description.trim(),
      budgetLamports: parsedBudget,
      taskType: resolvedTaskType as any,
      platform: resolvedPlatform as any,
      paymentTxSignature,
      ...(isCompetition ? {
        multisigAddress, vaultAddress,
        maxWinners: resolvedMaxWinners,
        ...(resolvedPrizeStructure ? { prizeStructure: resolvedPrizeStructure } : {}),
        isPublicFeed: !!isPublicFeed,
        allowPreLivePosts: !!allowPreLivePosts,
        paymentToken: resolvedPaymentToken as any,
        ...(resolvedPaymentToken === 'CUSTOM' ? {
          customTokenMint: customTokenMint,
          customTokenSymbol: customTokenSymbol,
          customTokenDecimals: Number(customTokenDecimals),
          ...(customTokenLogoUri ? { customTokenLogoUri: String(customTokenLogoUri) } : {}),
        } : {}),
      } : {}),
      ...(deadlineAt ? { deadlineAt } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageTransform ? { imageTransform } : {}),
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
      deadlineAt: task.deadlineAt ? task.deadlineAt.toISOString() : null,
      createdAt: task.createdAt.toISOString(),
      url: `${APP_URL}/tasks/${task.id}`,
    },
  }, { status: 201 })
}
