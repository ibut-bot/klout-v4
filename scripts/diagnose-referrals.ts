import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [totalScores, uniqueScoreUsers, allReferrals, completedReferrals, pendingReferrals] =
    await Promise.all([
      prisma.xScoreData.count(),
      prisma.xScoreData.groupBy({ by: ["userId"], _count: true }).then((r) => r.length),
      prisma.referral.count(),
      prisma.referral.count({ where: { completedAt: { not: null } } }),
      prisma.referral.count({ where: { completedAt: null } }),
    ]);

  console.log("\n=== Referral Program Diagnostic ===\n");
  console.log(`Total Klout score calculations:  ${totalScores}`);
  console.log(`Unique users with scores:        ${uniqueScoreUsers}`);
  console.log(`Total referral records:           ${allReferrals}`);
  console.log(`  Completed (has score):          ${completedReferrals}`);
  console.log(`  Pending (no score yet):         ${pendingReferrals}`);
  console.log(`  Non-referred score users:       ${uniqueScoreUsers - completedReferrals}`);
  console.log(`\nRemaining in Tier 1:             ${1000 - completedReferrals}`);

  if (pendingReferrals > 0) {
    const pending = await prisma.referral.findMany({
      where: { completedAt: null },
      include: {
        referredUser: { select: { walletAddress: true, xUsername: true, xUserId: true } },
        referrer: { select: { xUsername: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    console.log("\n--- Recent pending referrals (no score yet) ---");
    for (const r of pending) {
      const hasX = !!r.referredUser.xUserId;
      console.log(
        `  ${r.referrer.xUsername} → ${r.referredUser.xUsername || r.referredUser.walletAddress.slice(0, 8) + "..."} | X linked: ${hasX} | signed up: ${r.createdAt.toISOString().slice(0, 10)}`
      );
    }
  }

  if (completedReferrals > 0) {
    const completed = await prisma.referral.findMany({
      where: { completedAt: { not: null } },
      include: {
        referredUser: { select: { xUsername: true } },
        referrer: { select: { xUsername: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 10,
    });
    console.log("\n--- Recent completed referrals ---");
    for (const r of completed) {
      console.log(
        `  ${r.referrer.xUsername} → ${r.referredUser.xUsername} | tier: ${r.tierNumber} | completed: ${r.completedAt!.toISOString().slice(0, 10)}`
      );
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
