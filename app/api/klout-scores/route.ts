import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10))
  );
  const offset = (page - 1) * pageSize;

  try {
    const [users, total] = await Promise.all([
      prisma.kloutScore.findMany({
        orderBy: { rank: "asc" },
        skip: offset,
        take: pageSize,
      }),
      prisma.kloutScore.count(),
    ]);

    const hasMore = offset + users.length < total;

    // Optional auth: try to find current user's leaderboard entry
    let currentUser = null;
    try {
      const wallet = await authenticateRequest(req);
      if (wallet) {
        const user = await prisma.user.findUnique({
          where: { walletAddress: wallet },
          select: { xUserId: true },
        });
        if (user?.xUserId) {
          const entry = await prisma.kloutScore.findFirst({
            where: { twitterId: user.xUserId },
          });
          if (entry) {
            currentUser = {
              id: entry.id,
              name: entry.name,
              username: entry.username,
              image: entry.image,
              twitterId: entry.twitterId,
              score: entry.score,
              rank: entry.rank,
            };
          }
        }
      }
    } catch {
      // Auth is optional — ignore failures
    }

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        image: u.image,
        twitterId: u.twitterId,
        score: u.score,
        rank: u.rank,
      })),
      currentUser,
      pagination: {
        page,
        pageSize,
        nextPage: hasMore ? page + 1 : null,
        hasMore,
        total,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching klout scores:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
