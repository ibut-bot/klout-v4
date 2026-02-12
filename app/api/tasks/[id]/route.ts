import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://slopwork.xyz'
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
            minViews: task.campaignConfig.minViews,
          }
        : null,
      bidCount: task._count.bids,
      messageCount: task._count.messages,
      imageUrl: task.imageUrl,
      deadlineAt: task.deadlineAt ? task.deadlineAt.toISOString() : null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      url: `${APP_URL}/tasks/${task.id}`,
    },
    network: NETWORK,
    explorerPrefix: EXPLORER_PREFIX,
  })
}

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
    select: { creatorId: true },
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

  const { imageUrl } = body

  // Validate imageUrl if provided
  if (imageUrl !== undefined && imageUrl !== null && typeof imageUrl !== 'string') {
    return Response.json(
      { success: false, error: 'INVALID_IMAGE_URL', message: 'imageUrl must be a string or null' },
      { status: 400 }
    )
  }

  // Update task
  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
    },
  })

  return Response.json({
    success: true,
    task: {
      id: updated.id,
      imageUrl: updated.imageUrl,
      updatedAt: updated.updatedAt.toISOString(),
    },
  })
}
