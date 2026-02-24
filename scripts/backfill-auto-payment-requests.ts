import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'

const prisma = new PrismaClient()

/**
 * Backfill: For each campaign, find users whose cumulative APPROVED payout
 * meets or exceeds the campaign's minPayoutLamports. Auto-create a
 * CampaignPaymentRequest and transition those submissions to PAYMENT_REQUESTED.
 *
 * Only processes submissions where the individual post's payout >= minPayoutLamports
 * (matching the new auto-request logic in the submit route).
 */
async function main() {
  const configs = await prisma.campaignConfig.findMany({
    include: { task: { select: { id: true, budgetLamports: true } } },
  })

  let totalProcessed = 0

  for (const config of configs) {
    const taskId = config.taskId
    const minPayout = config.minPayoutLamports

    const approvedSubs = await prisma.campaignSubmission.findMany({
      where: { taskId, status: 'APPROVED', payoutLamports: { not: null, gt: BigInt(0) } },
    })

    if (approvedSubs.length === 0) continue

    // Group by submitter
    const bySubmitter = new Map<string, typeof approvedSubs>()
    for (const s of approvedSubs) {
      const arr = bySubmitter.get(s.submitterId) || []
      arr.push(s)
      bySubmitter.set(s.submitterId, arr)
    }

    for (const [submitterId, subs] of bySubmitter) {
      // Check if any single submission meets the threshold (matching the new auto-request trigger)
      const hasQualifyingPost = minPayout <= BigInt(0) || subs.some(s => (s.payoutLamports || BigInt(0)) >= minPayout)
      if (!hasQualifyingPost) continue

      const total = subs.reduce((sum, s) => sum + (s.payoutLamports || BigInt(0)), BigInt(0))
      if (total <= BigInt(0)) continue

      // Cap to remaining budget
      const capped = total > config.budgetRemainingLamports ? config.budgetRemainingLamports : total
      if (capped <= BigInt(0)) continue

      const ids = subs.map(s => s.id)

      await prisma.$transaction(async (tx) => {
        const freshConfig = await tx.campaignConfig.findUnique({ where: { taskId } })
        if (!freshConfig || freshConfig.budgetRemainingLamports <= BigInt(0)) return

        const effectivePayout = capped > freshConfig.budgetRemainingLamports ? freshConfig.budgetRemainingLamports : capped

        await tx.campaignConfig.update({
          where: { taskId },
          data: { budgetRemainingLamports: { decrement: effectivePayout } },
        })

        const paymentRequest = await tx.campaignPaymentRequest.create({
          data: { taskId, requesterId: submitterId, totalPayoutLamports: effectivePayout },
        })

        await tx.campaignSubmission.updateMany({
          where: { id: { in: ids } },
          data: { status: 'PAYMENT_REQUESTED', paymentRequestId: paymentRequest.id },
        })
      })

      totalProcessed += ids.length
      console.log(`Task ${taskId} | User ${submitterId}: ${ids.length} submission(s) → PAYMENT_REQUESTED`)
    }
  }

  console.log(`\nDone. Processed ${totalProcessed} submission(s).`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
