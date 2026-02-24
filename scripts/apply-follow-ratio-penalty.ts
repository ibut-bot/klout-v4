import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { followRatioMultiplier } from '../lib/wallchain'

const prisma = new PrismaClient()

async function main() {
  const latestRecords: {
    id: string
    xUsername: string
    totalScore: number
    followersCount: number
    followingCount: number
  }[] = await prisma.$queryRaw`
    SELECT DISTINCT ON ("userId") id, "xUsername", "totalScore", "followersCount", "followingCount"
    FROM "slopwork"."XScoreData"
    ORDER BY "userId", "createdAt" DESC
  `

  console.log(`Found ${latestRecords.length} users to evaluate.\n`)

  let updated = 0
  let skipped = 0

  for (const record of latestRecords) {
    const multiplier = followRatioMultiplier(record.followersCount, record.followingCount)

    if (multiplier >= 1.0) {
      skipped++
      continue
    }

    const newScore = Math.round(record.totalScore * multiplier)
    const qualityScore = newScore / 10_000
    const ratio = record.followersCount > 0
      ? (record.followingCount / record.followersCount).toFixed(2)
      : 'N/A'

    await prisma.xScoreData.update({
      where: { id: record.id },
      data: { totalScore: newScore, qualityScore },
    })

    updated++
    console.log(
      `[${updated}] ${record.xUsername}: ` +
      `following=${record.followingCount}, followers=${record.followersCount}, ` +
      `ratio=${ratio}, multiplier=${multiplier.toFixed(2)}, ` +
      `old=${record.totalScore} → new=${newScore}`
    )
  }

  console.log(`\nDone. Penalized: ${updated}, No penalty needed: ${skipped}`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
