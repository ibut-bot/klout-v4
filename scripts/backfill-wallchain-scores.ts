import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'

const prisma = new PrismaClient()
const WALLCHAIN_API_BASE = 'https://dev.api.wallchains.com'
const DELAY_MS = 2000

async function fetchWallchainScore(xUsername: string): Promise<number> {
  const res = await fetch(
    `${WALLCHAIN_API_BASE}/extension/x_score/score/${encodeURIComponent(xUsername)}`
  )
  if (!res.ok) {
    throw new Error(`Wallchain API error (${res.status})`)
  }
  const data = await res.json()
  return data.score
}

function applyScoreDeviation(baseScore: number): number {
  const deviation = 1 + (Math.random() * 0.10 - 0.05)
  return Math.max(0, Math.min(10_000, Math.round(baseScore * deviation)))
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  // Get only the latest record per user (the one actually displayed)
  const latestRecords: { id: string; xUsername: string; totalScore: number }[] = await prisma.$queryRaw`
    SELECT DISTINCT ON ("userId") id, "xUsername", "totalScore"
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
      const newScore = applyScoreDeviation(scaledScore)
      const qualityScore = newScore / 10_000

      await prisma.xScoreData.update({
        where: { id: record.id },
        data: { totalScore: newScore, qualityScore },
      })

      updated++
      console.log(
        `[${updated + failed}/${latestRecords.length}] ${record.xUsername}: ` +
        `wallchain=${wallchainScore}, scaled=${scaledScore}, old=${record.totalScore} → new=${newScore}`
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
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
