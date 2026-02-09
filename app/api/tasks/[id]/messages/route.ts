import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { createNotification } from '@/lib/notifications'

/** GET /api/tasks/:id/messages -- get messages for a private conversation on a task
 * 
 * Messages are private between the task creator and each bidder.
 * - Bidders can only see messages between themselves and the creator.
 * - Creator must specify which bidder's conversation to view via ?bidderId=
 * - After bid acceptance, only creator and winning bidder can view their conversation.
 */
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
      winningBid: { select: { bidderId: true, bidder: { select: { id: true, walletAddress: true } } } },
      bids: { select: { bidderId: true, bidder: { select: { id: true, walletAddress: true, username: true, profilePicUrl: true } } } },
    },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  const isCreator = task.creatorId === userId
  const userBid = task.bids.find(b => b.bidderId === userId)
  const isBidder = !!userBid
  const isWinningBidder = task.winningBid?.bidderId === userId

  // Must be creator or a bidder to see messages
  if (!isCreator && !isBidder) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only task creator and bidders can view messages' },
      { status: 403 }
    )
  }

  // After bid accepted, only creator and winning bidder can access
  if (task.winningBid && !isCreator && !isWinningBidder) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'After bid acceptance, only creator and winning bidder can view messages' },
      { status: 403 }
    )
  }

  // Determine the conversation partner
  let conversationPartnerId: string

  if (isCreator) {
    // Creator must specify which bidder's conversation to view
    const bidderId = request.nextUrl.searchParams.get('bidderId')
    if (!bidderId) {
      // Return list of bidders with message counts instead
      const bidderConversations = await Promise.all(
        task.bids.map(async (bid) => {
          // After bid acceptance, only show winning bidder's conversation
          if (task.winningBid && bid.bidderId !== task.winningBid.bidderId) {
            return null
          }
          const messageCount = await prisma.message.count({
            where: {
              taskId: id,
              OR: [
                { senderId: userId, recipientId: bid.bidderId },
                { senderId: bid.bidderId, recipientId: userId },
              ],
            },
          })
          const lastMessage = await prisma.message.findFirst({
            where: {
              taskId: id,
              OR: [
                { senderId: userId, recipientId: bid.bidderId },
                { senderId: bid.bidderId, recipientId: userId },
              ],
            },
            orderBy: { createdAt: 'desc' },
          })
          return {
            bidderId: bid.bidderId,
            bidderWallet: bid.bidder.walletAddress,
            bidderUsername: bid.bidder.username,
            bidderProfilePic: bid.bidder.profilePicUrl,
            messageCount,
            lastMessageAt: lastMessage?.createdAt.toISOString() || null,
          }
        })
      )

      return Response.json({
        success: true,
        conversations: bidderConversations.filter(Boolean),
        message: 'Specify bidderId to view a conversation',
      })
    }

    // Validate bidderId belongs to a bidder on this task
    const validBidder = task.bids.find(b => b.bidderId === bidderId)
    if (!validBidder) {
      return Response.json(
        { success: false, error: 'INVALID_BIDDER', message: 'Specified bidderId is not a bidder on this task' },
        { status: 400 }
      )
    }

    // After bid acceptance, creator can only view winning bidder's conversation
    if (task.winningBid && bidderId !== task.winningBid.bidderId) {
      return Response.json(
        { success: false, error: 'FORBIDDEN', message: 'After bid acceptance, can only view conversation with winning bidder' },
        { status: 403 }
      )
    }

    conversationPartnerId = bidderId
  } else {
    // Bidder: conversation partner is the creator
    conversationPartnerId = task.creatorId
  }

  const since = request.nextUrl.searchParams.get('since')
  const where: any = {
    taskId: id,
    OR: [
      { senderId: userId, recipientId: conversationPartnerId },
      { senderId: conversationPartnerId, recipientId: userId },
    ],
  }
  if (since) {
    const sinceDate = new Date(since)
    if (isNaN(sinceDate.getTime())) {
      return Response.json(
        { success: false, error: 'INVALID_PARAM', message: 'since must be a valid ISO date string' },
        { status: 400 }
      )
    }
    where.createdAt = { gt: sinceDate }
  }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: { sender: { select: { walletAddress: true, username: true, profilePicUrl: true } } },
  })

  return Response.json({
    success: true,
    messages: messages.map((m) => ({
      id: m.id,
      senderWallet: m.sender.walletAddress,
      senderUsername: m.sender.username,
      senderProfilePic: m.sender.profilePicUrl,
      content: m.content,
      attachments: m.attachments || [],
      createdAt: m.createdAt.toISOString(),
    })),
  })
}

/** POST /api/tasks/:id/messages -- send a private message
 * 
 * Messages are private between the task creator and each bidder.
 * - Bidders: message goes to the task creator automatically.
 * - Creator: must specify recipientId (bidderId) in the request body.
 */
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

  const { content, attachments, recipientId } = body

  // Content is required unless attachments are provided
  const hasContent = content && typeof content === 'string' && content.trim().length > 0
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0

  if (!hasContent && !hasAttachments) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: content (non-empty string) or attachments array' },
      { status: 400 }
    )
  }

  if (hasContent && content.length > 2000) {
    return Response.json(
      { success: false, error: 'CONTENT_TOO_LONG', message: 'Message content must be 2000 characters or less' },
      { status: 400 }
    )
  }

  // Validate attachments format
  if (hasAttachments) {
    if (attachments.length > 10) {
      return Response.json(
        { success: false, error: 'TOO_MANY_ATTACHMENTS', message: 'Maximum 10 attachments per message' },
        { status: 400 }
      )
    }
    for (const att of attachments) {
      if (!att.url || !att.contentType) {
        return Response.json(
          { success: false, error: 'INVALID_ATTACHMENT', message: 'Each attachment must have url and contentType' },
          { status: 400 }
        )
      }
    }
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      winningBid: { select: { bidderId: true } },
      bids: { select: { bidderId: true } },
    },
  })

  if (!task) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Task not found' }, { status: 404 })
  }

  const isCreator = task.creatorId === userId
  const userBid = task.bids.find(b => b.bidderId === userId)
  const isBidder = !!userBid
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

  // Determine recipient
  let actualRecipientId: string

  if (isCreator) {
    // Creator must specify which bidder to message
    if (!recipientId) {
      return Response.json(
        { success: false, error: 'MISSING_RECIPIENT', message: 'Creator must specify recipientId (bidderId) to send a message' },
        { status: 400 }
      )
    }

    // Validate recipientId is a bidder on this task
    const validBidder = task.bids.find(b => b.bidderId === recipientId)
    if (!validBidder) {
      return Response.json(
        { success: false, error: 'INVALID_RECIPIENT', message: 'recipientId must be a bidder on this task' },
        { status: 400 }
      )
    }

    // After bid acceptance, creator can only message winning bidder
    if (task.winningBid && recipientId !== task.winningBid.bidderId) {
      return Response.json(
        { success: false, error: 'FORBIDDEN', message: 'After bid acceptance, can only message the winning bidder' },
        { status: 403 }
      )
    }

    actualRecipientId = recipientId
  } else {
    // Bidder messages go to the creator
    actualRecipientId = task.creatorId
  }

  const message = await prisma.message.create({
    data: {
      taskId: id,
      senderId: userId,
      recipientId: actualRecipientId,
      content: hasContent ? content.trim() : '',
      attachments: hasAttachments ? attachments : undefined,
    },
  })

  // Notify the recipient about the new message
  createNotification({
    userId: actualRecipientId,
    type: 'NEW_MESSAGE',
    title: 'New message',
    body: hasContent ? content.trim().slice(0, 100) : 'Sent an attachment',
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    message: {
      id: message.id,
      senderWallet: wallet,
      content: message.content,
      attachments: message.attachments || [],
      createdAt: message.createdAt.toISOString(),
    },
  }, { status: 201 })
}
