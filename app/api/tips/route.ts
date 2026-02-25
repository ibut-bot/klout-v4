import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'
import { verifyPaymentTx } from '@/lib/solana/verify-tx'
import { createNotification } from '@/lib/notifications'

const TIP_AMOUNT_LAMPORTS = 10_000_000 // 0.01 SOL

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'INVALID_JSON' }, { status: 400 })
  }

  const { submissionId, txSignature } = body
  if (!submissionId || !txSignature) {
    return Response.json({ success: false, error: 'Missing submissionId or txSignature' }, { status: 400 })
  }

  const existing = await prisma.tip.findUnique({ where: { txSignature } })
  if (existing) {
    return Response.json({ success: false, error: 'TIP_ALREADY_RECORDED' }, { status: 409 })
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      bid: {
        select: {
          bidderId: true,
          bidder: { select: { walletAddress: true, username: true } },
          task: { select: { id: true, title: true } },
        },
      },
    },
  })

  if (!submission) {
    return Response.json({ success: false, error: 'Submission not found' }, { status: 404 })
  }

  const recipientWallet = submission.bid.bidder.walletAddress
  const recipientId = submission.bid.bidderId

  if (recipientId === userId) {
    return Response.json({ success: false, error: 'Cannot tip yourself' }, { status: 400 })
  }

  const verification = await verifyPaymentTx(txSignature, recipientWallet, TIP_AMOUNT_LAMPORTS)
  if (!verification.valid) {
    return Response.json(
      { success: false, error: 'TX_VERIFICATION_FAILED', message: verification.error },
      { status: 400 }
    )
  }

  const tip = await prisma.tip.create({
    data: {
      submissionId,
      tipperId: userId,
      recipientId,
      amountLamports: TIP_AMOUNT_LAMPORTS,
      txSignature,
    },
  })

  await createNotification({
    userId: recipientId,
    type: 'TIP_RECEIVED',
    title: 'You received a tip!',
    body: `Someone tipped you 0.01 SOL on your submission in "${submission.bid.task.title}"`,
    linkUrl: `/tasks/${submission.bid.task.id}`,
  })

  return Response.json({ success: true, tip: { id: tip.id } }, { status: 201 })
}
