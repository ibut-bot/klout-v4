import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

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
      bidCount: task._count.bids,
      messageCount: task._count.messages,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      url: `${APP_URL}/tasks/${task.id}`,
    },
    network: NETWORK,
    explorerPrefix: EXPLORER_PREFIX,
  })
}
