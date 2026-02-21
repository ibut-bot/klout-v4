import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

/** GET /api/me/tasks/submitters
 *  Returns unique submitter usernames across all campaigns owned by the authenticated user.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const submitters = await prisma.campaignSubmission.findMany({
    where: { task: { creatorId: userId } },
    select: {
      submitter: {
        select: { username: true, profilePicUrl: true },
      },
    },
    distinct: ['submitterId'],
    orderBy: { createdAt: 'desc' },
  })

  const unique = submitters
    .map((s) => ({
      username: s.submitter.username,
      profilePicUrl: s.submitter.profilePicUrl,
    }))
    .filter((s) => s.username)

  return Response.json({ success: true, submitters: unique })
}
