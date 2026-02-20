import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { createNotification } from '@/lib/notifications'

const MAX_DESCRIPTION_LENGTH = 10000

/** GET /api/tasks/:id/bids/:bidId/submit -- get submissions for a bid */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id, bidId } = await params

  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: { task: { select: { creatorId: true } } },
  })
  if (!bid || bid.taskId !== id) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Bid not found for this task' }, { status: 404 })
  }

  if (bid.bidderId !== userId && bid.task.creatorId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the task creator or bidder can view submissions' },
      { status: 403 }
    )
  }

  const submissions = await prisma.submission.findMany({
    where: { bidId },
    orderBy: { createdAt: 'desc' },
  })

  return Response.json({
    success: true,
    submissions: submissions.map((s) => ({
      id: s.id,
      bidId: s.bidId,
      description: s.description,
      attachments: s.attachments,
      createdAt: s.createdAt.toISOString(),
    })),
  })
}

/** POST /api/tasks/:id/bids/:bidId/submit -- submit deliverables for a bid */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bidId: string }> }
) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth
  const { id, bidId } = await params

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { description, attachments, multisigAddress, vaultAddress, proposalIndex, txSignature } = body

  if (!description || (typeof description === 'string' && description.trim().length === 0)) {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Required: description' },
      { status: 400 }
    )
  }

  if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) {
    return Response.json(
      { success: false, error: 'INVALID_DESCRIPTION', message: `description must be a string of at most ${MAX_DESCRIPTION_LENGTH} characters` },
      { status: 400 }
    )
  }

  const bid = await prisma.bid.findUnique({
    where: { id: bidId },
    include: { task: true },
  })
  if (!bid || bid.taskId !== id) {
    return Response.json({ success: false, error: 'NOT_FOUND', message: 'Bid not found for this task' }, { status: 404 })
  }

  // Only the bidder can submit deliverables
  if (bid.bidderId !== userId) {
    return Response.json(
      { success: false, error: 'FORBIDDEN', message: 'Only the bidder can submit deliverables' },
      { status: 403 }
    )
  }

  const task = bid.task
  const isCompetition = task.taskType === 'COMPETITION'

  // Validate bid status based on task type
  if (isCompetition) {
    // In competition mode, bidders submit before being selected. Bid must be PENDING.
    if (bid.status !== 'PENDING') {
      return Response.json(
        { success: false, error: 'INVALID_STATUS', message: `Bid is ${bid.status}. In competition mode, submissions are made while bid is PENDING.` },
        { status: 400 }
      )
    }
    // In competition mode, vault + payment proposal details are required at submission time
    if (!multisigAddress || !vaultAddress) {
      return Response.json(
        { success: false, error: 'MISSING_FIELDS', message: 'Competition mode requires multisigAddress and vaultAddress at submission time' },
        { status: 400 }
      )
    }
    if (proposalIndex === undefined || proposalIndex === null || !txSignature) {
      return Response.json(
        { success: false, error: 'MISSING_FIELDS', message: 'Competition mode requires proposalIndex and txSignature (payment proposal) at submission time' },
        { status: 400 }
      )
    }
  } else {
    // In quote mode, submission happens after bid is accepted and funded
    if (!['ACCEPTED', 'FUNDED'].includes(bid.status)) {
      return Response.json(
        { success: false, error: 'INVALID_STATUS', message: `Bid is ${bid.status}. In quote mode, submissions are made after bid is ACCEPTED or FUNDED.` },
        { status: 400 }
      )
    }
  }

  // Check for existing submission
  const existingSubmission = await prisma.submission.findFirst({
    where: { bidId },
  })
  if (existingSubmission) {
    return Response.json(
      { success: false, error: 'DUPLICATE_SUBMISSION', message: 'A submission already exists for this bid. Only one submission per bid is allowed.' },
      { status: 409 }
    )
  }

  // Validate attachments if provided
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
        { success: false, error: 'TOO_MANY_ATTACHMENTS', message: 'Maximum 20 attachments per submission' },
        { status: 400 }
      )
    }
    parsedAttachments = attachments
  }

  // For competition mode, update the bid with vault details and payment proposal
  if (isCompetition) {
    await prisma.bid.update({
      where: { id: bidId },
      data: {
        multisigAddress,
        vaultAddress,
        proposalIndex: Number(proposalIndex),
        // Note: we store the proposal tx sig but don't set paymentTxSig yet (that's for final execution)
      },
    })
  }

  const submission = await prisma.submission.create({
    data: {
      bidId,
      description: description.trim(),
      ...(parsedAttachments ? { attachments: parsedAttachments } : {}),
    },
  })

  // Notify task creator
  createNotification({
    userId: task.creatorId,
    type: 'SUBMISSION_RECEIVED',
    title: isCompetition ? 'New competition submission' : 'Deliverables submitted',
    body: isCompetition
      ? `A bidder submitted their work for "${task.title}"`
      : `The winning bidder submitted deliverables for "${task.title}"`,
    linkUrl: `/tasks/${id}`,
  })

  return Response.json({
    success: true,
    submission: {
      id: submission.id,
      bidId: submission.bidId,
      description: submission.description,
      attachments: submission.attachments,
      createdAt: submission.createdAt.toISOString(),
    },
    message: isCompetition
      ? 'Submission received with escrow vault. Waiting for task creator to pick a winner.'
      : 'Deliverables submitted successfully.',
  }, { status: 201 })
}
