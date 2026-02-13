import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
