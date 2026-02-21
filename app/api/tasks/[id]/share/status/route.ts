import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tasks/[id]/share/status
 * Check if the authenticated user has shared viewer access to this campaign.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const { id: taskId } = await context.params

  const share = await prisma.campaignShare.findUnique({
    where: { taskId_sharedWithId: { taskId, sharedWithId: auth.userId } },
  })

  return Response.json({ success: true, isSharedViewer: !!share })
}
