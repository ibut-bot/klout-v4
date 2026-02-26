import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://klout.gg'
const NETWORK = process.env.SOLANA_NETWORK || 'mainnet'
const EXPLORER_PREFIX = NETWORK === 'mainnet' ? 'https://solscan.io' : `https://solscan.io?cluster=${NETWORK}`

/** GET /api/tasks/:id -- get task detail */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      creator: { select: { walletAddress: true, username: true, profilePicUrl: true } },
      winningBid: {
        select: {
          id: true,
          amountLamports: true,
          multisigAddress: true,
          vaultAddress: true,
          proposalIndex: true,
          paymentTxSig: true,
          status: true,
          bidder: { select: { walletAddress: true, username: true, profilePicUrl: true } },
        },
      },
      campaignConfig: true,
      _count: { select: { bids: true, messages: true } },
    },
  })

  if (!task) {
    return Response.json(
      { success: false, error: 'NOT_FOUND', message: 'Task not found' },
      { status: 404 }
    )
  }

  return Response.json({
    success: true,
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      budgetLamports: task.budgetLamports.toString(),
      taskType: task.taskType,
      platform: task.platform,
      paymentToken: task.paymentToken,
      customTokenMint: task.customTokenMint,
      customTokenSymbol: task.customTokenSymbol,
      customTokenDecimals: task.customTokenDecimals,
      customTokenLogoUri: task.customTokenLogoUri,
      status: task.status,
      multisigAddress: task.multisigAddress,
      vaultAddress: task.vaultAddress,
      creatorWallet: task.creator.walletAddress,
      creatorUsername: task.creator.username,
      creatorProfilePic: task.creator.profilePicUrl,
      winningBid: task.winningBid
        ? {
            id: task.winningBid.id,
            amountLamports: task.winningBid.amountLamports.toString(),
            multisigAddress: task.winningBid.multisigAddress,
            vaultAddress: task.winningBid.vaultAddress,
            proposalIndex: task.winningBid.proposalIndex,
            paymentTxSig: task.winningBid.paymentTxSig,
            status: task.winningBid.status,
            bidderWallet: task.winningBid.bidder.walletAddress,
            bidderUsername: task.winningBid.bidder.username,
            bidderProfilePic: task.winningBid.bidder.profilePicUrl,
          }
        : null,
      campaignConfig: task.campaignConfig
        ? {
            cpmLamports: task.campaignConfig.cpmLamports.toString(),
            budgetRemainingLamports: task.campaignConfig.budgetRemainingLamports.toString(),
            guidelines: task.campaignConfig.guidelines,
            heading: task.campaignConfig.heading,
            minViews: task.campaignConfig.minViews,
            minLikes: task.campaignConfig.minLikes,
            minRetweets: task.campaignConfig.minRetweets,
            minComments: task.campaignConfig.minComments,
            minPayoutLamports: task.campaignConfig.minPayoutLamports.toString(),
            maxBudgetPerUserPercent: task.campaignConfig.maxBudgetPerUserPercent,
            maxBudgetPerPostPercent: task.campaignConfig.maxBudgetPerPostPercent,
            minKloutScore: task.campaignConfig.minKloutScore,
            requireFollowX: task.campaignConfig.requireFollowX,
            collateralLink: task.campaignConfig.collateralLink,
            bonusMinKloutScore: task.campaignConfig.bonusMinKloutScore,
            bonusMaxLamports: task.campaignConfig.bonusMaxLamports?.toString() ?? null,
          }
        : null,
      bidCount: task._count.bids,
      messageCount: task._count.messages,
      maxWinners: task.maxWinners,
      prizeStructure: task.prizeStructure,
      imageUrl: task.imageUrl,
      imageTransform: task.imageTransform,
      deadlineAt: task.deadlineAt ? task.deadlineAt.toISOString() : null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      url: `${APP_URL}/tasks/${task.id}`,
    },
    network: NETWORK,
    explorerPrefix: EXPLORER_PREFIX,
  })
}

const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 10000

/** PATCH /api/tasks/:id -- update task (creator only) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const { id } = await params

  // Check task exists and user is the creator
  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      creatorId: true,
      taskType: true,
      paymentToken: true,
      customTokenMint: true,
      customTokenSymbol: true,
      customTokenDecimals: true,
      customTokenLogoUri: true,
      budgetLamports: true,
      vaultAddress: true,
      campaignConfig: { select: { id: true, budgetRemainingLamports: true, minPayoutLamports: true } },
    },
  })

  if (!task) {
    return Response.json(
      { success: false, error: 'NOT_FOUND', message: 'Task not found' },
      { status: 404 }
    )
  }

  if (task.creatorId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the task creator can update this task' },
      { status: 403 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { imageUrl, imageTransform, title, description, guidelines, deadlineAt, budgetLamports, budgetIncreaseTxSignature, heading, minViews, minLikes, minRetweets, minComments, maxBudgetPerUserPercent, maxBudgetPerPostPercent, minKloutScore, requireFollowX, collateralLink, minPayoutLamports, cpmLamports, bonusMinKloutScore, bonusMaxLamports, isPublicFeed } = body
  const isCampaign = task.taskType === 'CAMPAIGN'
  const isCompetitionTask = task.taskType === 'COMPETITION'

  // Validate imageUrl if provided
  if (imageUrl !== undefined && imageUrl !== null) {
    if (typeof imageUrl !== 'string') {
      return Response.json(
        { success: false, error: 'INVALID_IMAGE_URL', message: 'imageUrl must be a string or null' },
        { status: 400 }
      )
    }
    if (imageUrl.length > 2000 || (imageUrl && !/^https?:\/\//.test(imageUrl))) {
      return Response.json(
        { success: false, error: 'INVALID_IMAGE_URL', message: 'imageUrl must be a valid HTTP(S) URL (max 2000 chars)' },
        { status: 400 }
      )
    }
  }

  // Validate imageTransform if provided
  if (imageTransform !== undefined && imageTransform !== null) {
    if (typeof imageTransform !== 'object' || typeof imageTransform.scale !== 'number' || typeof imageTransform.x !== 'number' || typeof imageTransform.y !== 'number') {
      return Response.json(
        { success: false, error: 'INVALID_IMAGE_TRANSFORM', message: 'imageTransform must be { scale: number, x: number, y: number } or null' },
        { status: 400 }
      )
    }
    if (imageTransform.scale < 1 || imageTransform.scale > 5) {
      return Response.json(
        { success: false, error: 'INVALID_IMAGE_TRANSFORM', message: 'imageTransform.scale must be between 1 and 5' },
        { status: 400 }
      )
    }
    if (imageTransform.x < 0 || imageTransform.x > 100 || imageTransform.y < 0 || imageTransform.y > 100) {
      return Response.json(
        { success: false, error: 'INVALID_IMAGE_TRANSFORM', message: 'imageTransform.x and y must be between 0 and 100' },
        { status: 400 }
      )
    }
  }

  // Validate title if provided
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0 || title.length > MAX_TITLE_LENGTH) {
      return Response.json(
        { success: false, error: 'INVALID_TITLE', message: `Title must be a non-empty string of at most ${MAX_TITLE_LENGTH} characters` },
        { status: 400 }
      )
    }
  }

  // Validate description if provided
  if (description !== undefined) {
    if (typeof description !== 'string' || description.trim().length === 0 || description.length > MAX_DESCRIPTION_LENGTH) {
      return Response.json(
        { success: false, error: 'INVALID_DESCRIPTION', message: `Description must be a non-empty string of at most ${MAX_DESCRIPTION_LENGTH} characters` },
        { status: 400 }
      )
    }
  }

  // Validate guidelines if provided (campaign only)
  if (guidelines !== undefined) {
    if (!isCampaign) {
      return Response.json(
        { success: false, error: 'INVALID_FIELD', message: 'guidelines can only be updated on CAMPAIGN tasks' },
        { status: 400 }
      )
    }
    if (!guidelines || typeof guidelines !== 'object' || !Array.isArray(guidelines.dos) || !Array.isArray(guidelines.donts)) {
      return Response.json(
        { success: false, error: 'INVALID_GUIDELINES', message: 'guidelines must have dos and donts arrays' },
        { status: 400 }
      )
    }
  }

  // Validate deadlineAt if provided
  if (deadlineAt !== undefined && deadlineAt !== null) {
    const deadline = new Date(deadlineAt)
    if (isNaN(deadline.getTime())) {
      return Response.json(
        { success: false, error: 'INVALID_DEADLINE', message: 'deadlineAt must be a valid ISO date string or null' },
        { status: 400 }
      )
    }
    if (deadline.getTime() < Date.now()) {
      return Response.json(
        { success: false, error: 'INVALID_DEADLINE', message: 'deadlineAt must be in the future' },
        { status: 400 }
      )
    }
  }

  // Validate budget increase (campaign only, increase only)
  let budgetIncrease: bigint | null = null
  if (budgetLamports !== undefined) {
    if (!isCampaign) {
      return Response.json(
        { success: false, error: 'INVALID_FIELD', message: 'Budget can only be increased on CAMPAIGN tasks' },
        { status: 400 }
      )
    }
    let newBudget: bigint
    try {
      newBudget = BigInt(budgetLamports)
      if (newBudget <= BigInt(0)) throw new Error('non-positive')
    } catch {
      return Response.json(
        { success: false, error: 'INVALID_BUDGET', message: 'budgetLamports must be a valid positive integer' },
        { status: 400 }
      )
    }
    if (newBudget <= task.budgetLamports) {
      return Response.json(
        { success: false, error: 'BUDGET_DECREASE_NOT_ALLOWED', message: 'Budget can only be increased, not decreased. New budget must be greater than current budget.' },
        { status: 400 }
      )
    }
    budgetIncrease = newBudget - task.budgetLamports

    if (!budgetIncreaseTxSignature) {
      return Response.json(
        { success: false, error: 'MISSING_TX', message: 'budgetIncreaseTxSignature is required when increasing budget. Send the difference to the campaign vault first.' },
        { status: 400 }
      )
    }

    // Verify the budget increase transaction on-chain
    const { getConnection } = await import('@/lib/solana/connection')
    const connection = getConnection()
    try {
      const tx = await connection.getParsedTransaction(budgetIncreaseTxSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      })
      if (!tx) {
        return Response.json(
          { success: false, error: 'TX_NOT_FOUND', message: 'Budget increase transaction not found or not confirmed on-chain' },
          { status: 400 }
        )
      }
      if (tx.meta?.err) {
        return Response.json(
          { success: false, error: 'TX_FAILED', message: 'Budget increase transaction failed on-chain' },
          { status: 400 }
        )
      }
    } catch (e: any) {
      return Response.json(
        { success: false, error: 'TX_VERIFY_ERROR', message: e.message || 'Failed to verify budget increase transaction' },
        { status: 400 }
      )
    }
  }

  // Build update data
  const taskUpdateData: any = {}
  if (imageUrl !== undefined) taskUpdateData.imageUrl = imageUrl || null
  if (imageTransform !== undefined) taskUpdateData.imageTransform = imageTransform
  if (title !== undefined) taskUpdateData.title = title.trim()
  if (description !== undefined) taskUpdateData.description = description.trim()
  if (deadlineAt !== undefined) taskUpdateData.deadlineAt = deadlineAt ? new Date(deadlineAt) : null
  if (budgetIncrease !== null && budgetLamports !== undefined) {
    taskUpdateData.budgetLamports = BigInt(budgetLamports)
  }
  if (isPublicFeed !== undefined && isCompetitionTask) {
    taskUpdateData.isPublicFeed = !!isPublicFeed
  }

  // Check if there are campaign config updates
  const hasCampaignConfigUpdates = guidelines !== undefined || heading !== undefined || minViews !== undefined || minLikes !== undefined || minRetweets !== undefined || minComments !== undefined || maxBudgetPerUserPercent !== undefined || maxBudgetPerPostPercent !== undefined || minKloutScore !== undefined || requireFollowX !== undefined || budgetIncrease !== null || collateralLink !== undefined || minPayoutLamports !== undefined || cpmLamports !== undefined || bonusMinKloutScore !== undefined || bonusMaxLamports !== undefined

  // Validate min payout can only increase
  if (minPayoutLamports !== undefined && task.campaignConfig) {
    const newMin = BigInt(Math.max(0, Number(minPayoutLamports) || 0))
    const currentMin = task.campaignConfig.minPayoutLamports ?? BigInt(0)
    if (newMin < currentMin) {
      return Response.json(
        { success: false, error: 'INVALID_MIN_PAYOUT', message: 'Minimum payout can only be increased, not decreased' },
        { status: 400 }
      )
    }
  }

  // Use transaction for campaign config updates
  if (isCampaign && hasCampaignConfigUpdates) {
    const result = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({
        where: { id },
        data: taskUpdateData,
      })

      const configUpdate: any = {}
      if (guidelines !== undefined) {
        configUpdate.guidelines = {
          dos: guidelines.dos.map((d: string) => String(d).trim()).filter(Boolean),
          donts: guidelines.donts.map((d: string) => String(d).trim()).filter(Boolean),
        }
      }
      if (heading !== undefined) configUpdate.heading = heading || null
      if (collateralLink !== undefined) configUpdate.collateralLink = collateralLink ? String(collateralLink).trim() : null
      if (minViews !== undefined) configUpdate.minViews = Math.max(0, parseInt(minViews) || 0)
      if (minLikes !== undefined) configUpdate.minLikes = Math.max(0, parseInt(minLikes) || 0)
      if (minRetweets !== undefined) configUpdate.minRetweets = Math.max(0, parseInt(minRetweets) || 0)
      if (minComments !== undefined) configUpdate.minComments = Math.max(0, parseInt(minComments) || 0)
      if (maxBudgetPerUserPercent !== undefined) {
        configUpdate.maxBudgetPerUserPercent = maxBudgetPerUserPercent === null || maxBudgetPerUserPercent === '' || Number(maxBudgetPerUserPercent) <= 0
          ? null
          : Math.max(1, Math.min(100, Number(maxBudgetPerUserPercent)))
      }
      if (maxBudgetPerPostPercent !== undefined) {
        configUpdate.maxBudgetPerPostPercent = maxBudgetPerPostPercent === null || maxBudgetPerPostPercent === '' || Number(maxBudgetPerPostPercent) <= 0
          ? null
          : Math.max(0.1, Math.min(100, Number(maxBudgetPerPostPercent)))
      }
      if (minKloutScore !== undefined) {
        configUpdate.minKloutScore = minKloutScore === null || minKloutScore === '' || Number(minKloutScore) <= 0
          ? null
          : Math.max(1, Math.min(10000, Math.round(Number(minKloutScore))))
      }
      if (requireFollowX !== undefined) {
        configUpdate.requireFollowX = requireFollowX ? String(requireFollowX).trim().replace(/^@/, '') : null
      }
      if (cpmLamports !== undefined) {
        const newCpm = BigInt(Math.max(1, Math.round(Number(cpmLamports))))
        configUpdate.cpmLamports = newCpm
      }
      if (bonusMinKloutScore !== undefined) {
        configUpdate.bonusMinKloutScore = bonusMinKloutScore === null || bonusMinKloutScore === '' || Number(bonusMinKloutScore) <= 0
          ? null
          : Math.max(1, Math.min(10000, Math.round(Number(bonusMinKloutScore))))
      }
      if (bonusMaxLamports !== undefined) {
        configUpdate.bonusMaxLamports = bonusMaxLamports === null || bonusMaxLamports === '' || Number(bonusMaxLamports) <= 0
          ? null
          : BigInt(Math.max(1, Math.round(Number(bonusMaxLamports))))
      }
      if (budgetIncrease !== null && task.campaignConfig) {
        configUpdate.budgetRemainingLamports = task.campaignConfig.budgetRemainingLamports + budgetIncrease
      }
      if (minPayoutLamports !== undefined && task.campaignConfig) {
        configUpdate.minPayoutLamports = BigInt(Math.max(0, Number(minPayoutLamports) || 0))
      }

      if (Object.keys(configUpdate).length > 0 && task.campaignConfig) {
        await tx.campaignConfig.update({
          where: { id: task.campaignConfig.id },
          data: configUpdate,
        })
      }

      return updatedTask
    })

    return Response.json({
      success: true,
      task: {
        id: result.id,
        title: result.title,
        description: result.description,
        budgetLamports: result.budgetLamports.toString(),
        imageUrl: result.imageUrl,
        imageTransform: result.imageTransform,
        deadlineAt: result.deadlineAt ? result.deadlineAt.toISOString() : null,
        updatedAt: result.updatedAt.toISOString(),
      },
    })
  }

  // Simple update (no campaign config changes)
  const updated = await prisma.task.update({
    where: { id },
    data: taskUpdateData,
  })

  return Response.json({
    success: true,
    task: {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      budgetLamports: updated.budgetLamports.toString(),
      imageUrl: updated.imageUrl,
      imageTransform: updated.imageTransform,
      deadlineAt: updated.deadlineAt ? updated.deadlineAt.toISOString() : null,
      updatedAt: updated.updatedAt.toISOString(),
    },
  })
}
