import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://klout.gg'

/**
 * GET /api/users/:wallet/submissions
 *
 * List all submissions made by a user, along with task details,
 * bid outcome (won/lost), and payout information.
 *
 * Query params: limit, page
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params
  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)))
  const skip = (page - 1) * limit

  if (!wallet || typeof wallet !== 'string') {
    return Response.json(
      { success: false, error: 'INVALID_WALLET', message: 'Wallet address is required' },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { walletAddress: wallet },
    select: { id: true },
  })

  if (!user) {
    return Response.json(
      { success: false, error: 'USER_NOT_FOUND', message: 'User not found' },
      { status: 404 }
    )
  }

  // Find all submissions where the bid belongs to this user
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where: {
        bid: { bidderId: user.id },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        bid: {
          include: {
            task: {
              include: {
                creator: {
                  select: { walletAddress: true, username: true, profilePicUrl: true },
                },
              },
            },
            wonTask: { select: { id: true } },
          },
        },
      },
    }),
    prisma.submission.count({
      where: {
        bid: { bidderId: user.id },
      },
    }),
  ])

  const mapped = submissions.map((s) => {
    const bid = s.bid
    const task = bid.task
    const isWinner = bid.wonTask !== null
    const isRejected = bid.status === 'REJECTED'
    const isPending = bid.status === 'PENDING'
    const isCompleted = bid.status === 'COMPLETED'

    let outcome: 'won' | 'lost' | 'pending' | 'in_progress'
    if (isWinner && isCompleted) outcome = 'won'
    else if (isWinner) outcome = 'in_progress'
    else if (isRejected) outcome = 'lost'
    else if (isPending) outcome = 'pending'
    else outcome = 'in_progress'

    // Platform fee is 10%, so payout is 90% of the bid amount
    const bidLamports = Number(bid.amountLamports)
    const payoutLamports = isCompleted ? Math.floor(bidLamports * 0.9) : 0

    return {
      id: s.id,
      description: s.description,
      attachments: s.attachments,
      createdAt: s.createdAt.toISOString(),
      outcome,
      bid: {
        id: bid.id,
        amountLamports: bid.amountLamports.toString(),
        status: bid.status,
      },
      task: {
        id: task.id,
        title: task.title,
        taskType: task.taskType,
        status: task.status,
        budgetLamports: task.budgetLamports.toString(),
        creatorWallet: task.creator.walletAddress,
        creatorUsername: task.creator.username,
        creatorProfilePic: task.creator.profilePicUrl,
        url: `${APP_URL}/tasks/${task.id}`,
      },
      payout: {
        bidAmountLamports: bid.amountLamports.toString(),
        payoutLamports: payoutLamports.toString(),
        platformFeeLamports: isCompleted ? (bidLamports - payoutLamports).toString() : '0',
        paid: isCompleted,
      },
    }
  })

  return Response.json({
    success: true,
    submissions: mapped,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}
