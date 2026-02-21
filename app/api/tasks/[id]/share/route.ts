import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tasks/[id]/share
 * List all users this campaign is shared with. Creator only.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { id: taskId } = await context.params

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, creatorId: true, taskType: true },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.taskType !== 'CAMPAIGN') {
    return Response.json({ success: false, error: 'INVALID_TASK_TYPE', message: 'Only campaigns can be shared' }, { status: 400 })
  }

  if (task.creatorId !== auth.userId) {
    return Response.json({ success: false, error: 'FORBIDDEN', message: 'Only the campaign creator can manage sharing' }, { status: 403 })
  }

  const shares = await prisma.campaignShare.findMany({
    where: { taskId },
    include: {
      sharedWith: {
        select: { id: true, walletAddress: true, username: true, profilePicUrl: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json({
    success: true,
    shares: shares.map((s) => ({
      id: s.id,
      userId: s.sharedWith.id,
      walletAddress: s.sharedWith.walletAddress,
      username: s.sharedWith.username,
      profilePicUrl: s.sharedWith.profilePicUrl,
      createdAt: s.createdAt.toISOString(),
    })),
  })
}

/**
 * POST /api/tasks/[id]/share
 * Share campaign dashboard with a wallet address. Creator only.
 * Body: { walletAddress: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { id: taskId } = await context.params

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, creatorId: true, taskType: true },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.taskType !== 'CAMPAIGN') {
    return Response.json({ success: false, error: 'INVALID_TASK_TYPE', message: 'Only campaigns can be shared' }, { status: 400 })
  }

  if (task.creatorId !== auth.userId) {
    return Response.json({ success: false, error: 'FORBIDDEN', message: 'Only the campaign creator can share this campaign' }, { status: 403 })
  }

  const body = await request.json()
  const { walletAddress } = body

  if (!walletAddress || typeof walletAddress !== 'string') {
    return Response.json({ success: false, error: 'INVALID_INPUT', message: 'walletAddress is required' }, { status: 400 })
  }

  const targetUser = await prisma.user.findUnique({
    where: { walletAddress },
    select: { id: true, walletAddress: true, username: true, profilePicUrl: true },
  })

  if (!targetUser) {
    return Response.json({ success: false, error: 'USER_NOT_FOUND', message: 'No user found with that wallet address' }, { status: 404 })
  }

  if (targetUser.id === auth.userId) {
    return Response.json({ success: false, error: 'INVALID_INPUT', message: 'You cannot share a campaign with yourself' }, { status: 400 })
  }

  const existing = await prisma.campaignShare.findUnique({
    where: { taskId_sharedWithId: { taskId, sharedWithId: targetUser.id } },
  })

  if (existing) {
    return Response.json({ success: false, error: 'ALREADY_SHARED', message: 'Campaign is already shared with this user' }, { status: 409 })
  }

  const share = await prisma.campaignShare.create({
    data: { taskId, sharedWithId: targetUser.id },
  })

  return Response.json({
    success: true,
    share: {
      id: share.id,
      userId: targetUser.id,
      walletAddress: targetUser.walletAddress,
      username: targetUser.username,
      profilePicUrl: targetUser.profilePicUrl,
      createdAt: share.createdAt.toISOString(),
    },
  })
}

/**
 * DELETE /api/tasks/[id]/share
 * Remove sharing for a user. Creator only.
 * Body: { userId: string }
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { id: taskId } = await context.params

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, creatorId: true, taskType: true },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  if (task.creatorId !== auth.userId) {
    return Response.json({ success: false, error: 'FORBIDDEN', message: 'Only the campaign creator can manage sharing' }, { status: 403 })
  }

  const body = await request.json()
  const { userId } = body

  if (!userId || typeof userId !== 'string') {
    return Response.json({ success: false, error: 'INVALID_INPUT', message: 'userId is required' }, { status: 400 })
  }

  const share = await prisma.campaignShare.findUnique({
    where: { taskId_sharedWithId: { taskId, sharedWithId: userId } },
  })

  if (!share) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Share not found' }, { status: 404 })
  }

  await prisma.campaignShare.delete({ where: { id: share.id } })

  return Response.json({ success: true })
}
