import 'dotenv/config'
import { PrismaClient } from '../app/generated/prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Get latest record per user where they do NOT have blue tick
  const records: { id: string; xUsername: string; totalScore: number; verifiedType: string | null }[] = await prisma.$queryRaw`
    SELECT DISTINCT ON ("userId") id, "xUsername", "totalScore", "verifiedType"
    FROM "slopwork"."XScoreData"
    ORDER BY "userId", "createdAt" DESC
  `

  const nonBlue = records.filter((r) => r.verifiedType !== 'blue')
  const alreadyBlue = records.length - nonBlue.length

  console.log(`Total users: ${records.length}`)
  console.log(`Blue tick (no change needed): ${alreadyBlue}`)
  console.log(`Non-blue-tick (applying 90% reduction): ${nonBlue.length}\n`)

  let updated = 0

  for (const record of nonBlue) {
    const newScore = Math.round(record.totalScore * 0.10)
    const qualityScore = newScore / 10_000

    await prisma.xScoreData.update({
      where: { id: record.id },
      data: { totalScore: newScore, qualityScore },
    })

    updated++
    console.log(
      `[${updated}/${nonBlue.length}] ${record.xUsername}: ` +
      `verified=${record.verifiedType ?? 'none'}, old=${record.totalScore} → new=${newScore}`
    )
  }

  console.log(`\nDone. ${updated} records updated with 90% penalty.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  prisma.$disconnect()
  process.exit(1)
})
