import { prisma } from '@/lib/db'
import { getScoreLabel } from '@/lib/klout-scoring'

/**
 * GET /api/buffed-showcase
 *
 * Returns a list of buffed profile image URLs for the homepage showcase.
 * Public endpoint — no auth required.
 */
export async function GET() {
  try {
    const rows = await prisma.xScoreData.findMany({
      where: { buffedImageUrl: { not: null } },
      select: {
        buffedImageUrl: true,
        xUsername: true,
        totalScore: true,
        tierQuote: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const images = rows
      .filter((r) => r.buffedImageUrl)
      .map((r) => ({
        url: r.buffedImageUrl!,
        username: r.xUsername,
        score: Math.round(r.totalScore),
        label: getScoreLabel(r.totalScore),
        quote: r.tierQuote,
      }))

    const res = Response.json({ success: true, images })
    res.headers.set('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res
  } catch (err: any) {
    console.error('[buffed-showcase] Error:', err)
    return Response.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
