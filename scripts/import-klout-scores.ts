/**
 * One-time script to import klout scores from v3 database into v4.
 *
 * Usage:
 *   V3_DATABASE_URL="postgres://..." npx tsx scripts/import-klout-scores.ts
 *
 * If V3_DATABASE_URL is not set, it falls back to the hardcoded v3 connection string.
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const V3_DATABASE_URL =
  process.env.V3_DATABASE_URL ||
  "***REDACTED***";

async function main() {
  console.log("Connecting to v3 database...");
  const v3Pool = new Pool({ connectionString: V3_DATABASE_URL });

  console.log("Connecting to v4 database (Prisma)...");
  const prisma = new PrismaClient();

  try {
    // Fetch all users with scores from v3, ordered by score descending
    console.log("Fetching users from v3...");
    const { rows } = await v3Pool.query<{
      id: string;
      name: string | null;
      username: string | null;
      image: string | null;
      twitter_id: string | null;
      score: string | null;
    }>(
      `SELECT id, name, username, image, twitter_id, score
       FROM "user"
       ORDER BY COALESCE(score::float, 0) DESC`
    );

    console.log(`Fetched ${rows.length} users from v3.`);

    if (rows.length === 0) {
      console.log("No users to import.");
      return;
    }

    // Map to KloutScore records with rank
    const records = rows.map((row, index) => ({
      id: row.id,
      name: row.name || null,
      username: row.username || null,
      image: row.image || null,
      twitterId: row.twitter_id || null,
      score: row.score ? parseFloat(row.score) : 0,
      rank: index + 1,
    }));

    // Clear existing data and insert fresh
    console.log("Clearing existing KloutScore data...");
    await prisma.kloutScore.deleteMany();

    // Insert in batches of 500
    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await prisma.kloutScore.createMany({ data: batch });
      inserted += batch.length;
      console.log(`  Inserted ${inserted}/${records.length}...`);
    }

    console.log(`Done! Imported ${inserted} klout scores into v4.`);
  } finally {
    await v3Pool.end();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
