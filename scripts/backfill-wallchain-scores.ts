import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'
import { fetchWallchainScore, applyScoreDeviation, closeBrowser } from '../lib/wallchain'

const prisma = new PrismaClient()
const DELAY_MS = 1000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const latestRecords: { id: string; xUsername: string; totalScore: number; verifiedType: string | null }[] = await prisma.$queryRaw`
    SELECT DISTINCT ON ("userId") id, "xUsername", "totalScore", "verifiedType"
    FROM "slopwork"."XScoreData"
    ORDER BY "userId", "createdAt" DESC
  `

  console.log(`Found ${latestRecords.length} users (latest record each) to backfill.\n`)

  let updated = 0
  let failed = 0

  for (const record of latestRecords) {
    try {
      const wallchainScore = await fetchWallchainScore(record.xUsername)
      const scaledScore = wallchainScore * 10
      let newScore = applyScoreDeviation(scaledScore)

      if (record.verifiedType !== 'blue') {
        newScore = Math.round(newScore * 0.10)
      }

      const qualityScore = newScore / 10_000

      await prisma.xScoreData.update({
        where: { id: record.id },
        data: { totalScore: newScore, qualityScore },
      })

      updated++
      console.log(
        `[${updated + failed}/${latestRecords.length}] ${record.xUsername}: ` +
        `wallchain=${wallchainScore}, scaled=${scaledScore}, verified=${record.verifiedType ?? 'none'}, ` +
        `old=${record.totalScore} → new=${newScore}`
      )
    } catch (err: any) {
      failed++
      console.error(
        `[${updated + failed}/${latestRecords.length}] FAILED ${record.xUsername}: ${err.message}`
      )
    }

    await sleep(DELAY_MS)
  }

  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}`)
  await closeBrowser()
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await closeBrowser()
  await prisma.$disconnect()
  process.exit(1)
})
