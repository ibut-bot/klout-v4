/**
 * One-time script to scale KloutScore values back to 10K base.
 * Multiplies all scores by 100 (reverting the previous scale-down).
 *
 * Usage:
 *   npx tsx scripts/scale-up-klout-scores.ts
 */

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";

async function main() {
  const prisma = new PrismaClient();

  try {
    const before = await prisma.kloutScore.aggregate({
      _max: { score: true },
      _min: { score: true },
      _avg: { score: true },
      _count: true,
    });

    console.log(`Found ${before._count} scores.`);
    console.log(`Before — max: ${before._max.score}, min: ${before._min.score}, avg: ${before._avg.score?.toFixed(2)}`);

    const result = await prisma.$executeRawUnsafe(
      `UPDATE "slopwork"."KloutScore" SET score = ROUND((score * 100)::numeric, 0)`
    );

    console.log(`Updated ${result} rows.`);

    const after = await prisma.kloutScore.aggregate({
      _max: { score: true },
      _min: { score: true },
      _avg: { score: true },
    });

    console.log(`After  — max: ${after._max.score}, min: ${after._min.score}, avg: ${after._avg.score?.toFixed(2)}`);
    console.log("Done!");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
