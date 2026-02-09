import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

/** POST /api/disputes/:id/respond
 *  Respond to a dispute raised against you.
 *  Body: { reason: string, evidenceUrls?: string[] }
 *
 *  Only the other party (not the one who raised the dispute) can respond.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id } = await params

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { reason, evidenceUrls } = body
  if (!reason) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: reason' },
      { status: 400 }
    )
  }

  if (typeof reason !== 'string' || reason.length < 10 || reason.length > 5000) {
    return Response.json(
      { success: false, error: 'INVALID_REASON', message: 'reason must be between 10 and 5000 characters' },
      { status: 400 }
    )
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      bid: {
        include: {
          task: true,
        },
      },
    },
  })

  if (!dispute) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Dispute not found' }, { status: 404 })
  }

  if (dispute.status !== 'PENDING') {
    return Response.json(
      { success: false, error: 'DISPUTE_RESOLVED', message: 'This dispute has already been resolved' },
      { status: 400 }
    )
  }

  // Determine who can respond (the other party)
  const isCreator = dispute.bid.task.creatorId === userId
  const isBidder = dispute.bid.bidderId === userId

  if (!isCreator && !isBidder) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only task parties can respond to disputes' },
      { status: 403 }
    )
  }

  // Can only respond if you're NOT the one who raised it
  const canRespond = (dispute.raisedBy === 'CREATOR' && isBidder) || (dispute.raisedBy === 'BIDDER' && isCreator)
  if (!canRespond) {
    return Response.json(
      { success: false, error: 'CANNOT_RESPOND', message: 'You cannot respond to your own dispute' },
      { status: 400 }
    )
  }

  if (dispute.responseReason) {
    return Response.json(
      { success: false, error: 'ALREADY_RESPONDED', message: 'A response has already been submitted' },
      { status: 400 }
    )
  }

  const updated = await prisma.dispute.update({
    where: { id },
    data: {
      responseReason: reason,
      responseEvidence: evidenceUrls || [],
    },
  })

  return Response.json({
    success: true,
    message: 'Response submitted successfully',
    dispute: {
      id: updated.id,
      responseReason: updated.responseReason,
      responseEvidence: updated.responseEvidence,
    },
  })
}
