import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params

  if (!wallet || typeof wallet !== 'string') {
    return Response.json(
      { success: false, error: 'INVALID_WALLET', message: 'Wallet address is required' },
      { status: 400 }
    )
  }

  // Find the user
  const user = await prisma.user.findUnique({
    where: { walletAddress: wallet },
    select: {
      id: true,
      walletAddress: true,
      profilePicUrl: true,
      createdAt: true,
    },
  })

  if (!user) {
    return Response.json(
      { success: false, error: 'USER_NOT_FOUND', message: 'User not found' },
      { status: 404 }
    )
  }

  // Fetch all stats in parallel
  const [
    // As task poster (client)
    tasksPosted,
    tasksCompleted,
    tasksCancelled,
    tasksInProgress,
    tasksOpen,
    tasksDisputed,
    // As bidder (worker)
    totalBids,
    bidsAccepted,
    bidsCompleted,
    bidsFunded,
    bidsDisputed,
    // Disputes
    disputesAsCreator,
    disputesAsBidder,
  ] = await Promise.all([
    // Tasks posted stats
    prisma.task.findMany({
      where: { creatorId: user.id },
      select: { budgetLamports: true, status: true },
    }),
    prisma.task.count({ where: { creatorId: user.id, status: 'COMPLETED' } }),
    prisma.task.count({ where: { creatorId: user.id, status: 'CANCELLED' } }),
    prisma.task.count({ where: { creatorId: user.id, status: 'IN_PROGRESS' } }),
    prisma.task.count({ where: { creatorId: user.id, status: 'OPEN' } }),
    prisma.task.count({ where: { creatorId: user.id, status: 'DISPUTED' } }),

    // Bids stats
    prisma.bid.findMany({
      where: { bidderId: user.id },
      select: { amountLamports: true, status: true },
    }),
    prisma.bid.count({ where: { bidderId: user.id, status: 'ACCEPTED' } }),
    prisma.bid.count({ where: { bidderId: user.id, status: 'COMPLETED' } }),
    prisma.bid.count({ where: { bidderId: user.id, status: 'FUNDED' } }),
    prisma.bid.count({ where: { bidderId: user.id, status: 'DISPUTED' } }),

    // Disputes where user is task creator
    prisma.dispute.findMany({
      where: {
        bid: {
          task: { creatorId: user.id },
        },
      },
      select: {
        status: true,
        raisedBy: true,
      },
    }),

    // Disputes where user is bidder
    prisma.dispute.findMany({
      where: {
        bid: { bidderId: user.id },
      },
      select: {
        status: true,
        raisedBy: true,
      },
    }),
  ])

  // Calculate task poster stats
  const totalTasksPosted = tasksPosted.length
  const totalTaskBudget = tasksPosted.reduce((sum, t) => sum + t.budgetLamports, BigInt(0))
  
  // Amount paid out = sum of completed tasks' budgets
  const completedTasks = await prisma.task.findMany({
    where: { creatorId: user.id, status: 'COMPLETED' },
    include: { winningBid: { select: { amountLamports: true } } },
  })
  const amountPaidOut = completedTasks.reduce(
    (sum, t) => sum + (t.winningBid?.amountLamports || BigInt(0)),
    BigInt(0)
  )

  // Calculate bidder stats
  const totalBidsPlaced = totalBids.length
  const totalBidValue = totalBids.reduce((sum, b) => sum + b.amountLamports, BigInt(0))
  
  // Tasks won = bids that are at least ACCEPTED (ACCEPTED, FUNDED, PAYMENT_REQUESTED, COMPLETED)
  const tasksWon = totalBids.filter(
    (b) => ['ACCEPTED', 'FUNDED', 'PAYMENT_REQUESTED', 'COMPLETED'].includes(b.status)
  ).length
  
  // Amount received = completed bids amount
  const completedBids = totalBids.filter((b) => b.status === 'COMPLETED')
  const amountReceived = completedBids.reduce((sum, b) => sum + b.amountLamports, BigInt(0))

  // Calculate dispute stats as creator
  const disputesAsCreatorCount = disputesAsCreator.length
  const disputesAsCreatorPending = disputesAsCreator.filter((d) => d.status === 'PENDING').length
  // Disputes in favor as creator: 
  // - If creator raised and ACCEPTED = in favor
  // - If bidder raised and DENIED = in favor
  const disputesAsCreatorInFavor = disputesAsCreator.filter(
    (d) =>
      (d.raisedBy === 'CREATOR' && d.status === 'ACCEPTED') ||
      (d.raisedBy === 'BIDDER' && d.status === 'DENIED')
  ).length
  const disputesAsCreatorAgainst = disputesAsCreator.filter(
    (d) =>
      (d.raisedBy === 'CREATOR' && d.status === 'DENIED') ||
      (d.raisedBy === 'BIDDER' && d.status === 'ACCEPTED')
  ).length

  // Calculate dispute stats as bidder
  const disputesAsBidderCount = disputesAsBidder.length
  const disputesAsBidderPending = disputesAsBidder.filter((d) => d.status === 'PENDING').length
  // Disputes in favor as bidder:
  // - If bidder raised and ACCEPTED = in favor
  // - If creator raised and DENIED = in favor
  const disputesAsBidderInFavor = disputesAsBidder.filter(
    (d) =>
      (d.raisedBy === 'BIDDER' && d.status === 'ACCEPTED') ||
      (d.raisedBy === 'CREATOR' && d.status === 'DENIED')
  ).length
  const disputesAsBidderAgainst = disputesAsBidder.filter(
    (d) =>
      (d.raisedBy === 'BIDDER' && d.status === 'DENIED') ||
      (d.raisedBy === 'CREATOR' && d.status === 'ACCEPTED')
  ).length

  return Response.json({
    success: true,
    user: {
      walletAddress: user.walletAddress,
      profilePicUrl: user.profilePicUrl,
      memberSince: user.createdAt.toISOString(),
    },
    asClient: {
      totalTasksPosted,
      totalTaskBudgetLamports: totalTaskBudget.toString(),
      tasksOpen,
      tasksInProgress,
      tasksCompleted,
      tasksCancelled,
      tasksDisputed,
      amountPaidOutLamports: amountPaidOut.toString(),
      disputes: {
        total: disputesAsCreatorCount,
        pending: disputesAsCreatorPending,
        inFavor: disputesAsCreatorInFavor,
        against: disputesAsCreatorAgainst,
      },
    },
    asWorker: {
      totalBidsPlaced,
      totalBidValueLamports: totalBidValue.toString(),
      tasksWon,
      tasksInProgress: bidsFunded,
      tasksCompleted: bidsCompleted,
      tasksDisputed: bidsDisputed,
      amountReceivedLamports: amountReceived.toString(),
      disputes: {
        total: disputesAsBidderCount,
        pending: disputesAsBidderPending,
        inFavor: disputesAsBidderInFavor,
        against: disputesAsBidderAgainst,
      },
    },
  })
}
