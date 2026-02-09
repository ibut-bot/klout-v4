import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/api-helpers'

/** GET /api/me/notifications -- list notifications for the current user */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const url = request.nextUrl
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true'
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50)

  const where: any = { userId }
  if (unreadOnly) where.read = false

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ])

  return Response.json({
    success: true,
    unreadCount,
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  })
}

/** PATCH /api/me/notifications -- mark notifications as read */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const { ids, markAllRead } = body

  if (markAllRead) {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })
  } else if (Array.isArray(ids) && ids.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { read: true },
    })
  } else {
    return Response.json(
      { success: false, error: 'MISSING_FIELDS', message: 'Provide ids array or markAllRead: true' },
      { status: 400 }
    )
  }

  return Response.json({ success: true })
}
