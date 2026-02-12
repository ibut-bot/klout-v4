import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

// Username validation: 3-20 chars, alphanumeric and underscores only
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

/** GET /api/profile/username - Get current user's username */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  const user = await prisma.user.findUnique({ where: { id: userId } })

  return Response.json({
    success: true,
    username: user?.username || null,
  })
}

/** PUT /api/profile/username - Set or update username */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId, wallet } = auth

  const rl = rateLimitResponse(`profileUpdate:${wallet}`, RATE_LIMITS.profileUpdate)
  if (rl) return rl

  let body: { username: string }
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_JSON', message: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const { username } = body

  // Validate username format
  if (!username || typeof username !== 'string') {
    return Response.json(
      { success: false, error: 'INVALID_USERNAME', message: 'Username is required' },
      { status: 400 }
    )
  }

  const trimmedUsername = username.trim()

  if (!USERNAME_REGEX.test(trimmedUsername)) {
    return Response.json(
      {
        success: false,
        error: 'INVALID_USERNAME_FORMAT',
        message: 'Username must be 3-20 characters, alphanumeric and underscores only',
      },
      { status: 400 }
    )
  }

  // Check if username is already taken (case-insensitive)
  const existingUser = await prisma.user.findFirst({
    where: {
      username: { equals: trimmedUsername, mode: 'insensitive' },
      NOT: { id: userId },
    },
  })

  if (existingUser) {
    return Response.json(
      { success: false, error: 'USERNAME_TAKEN', message: 'This username is already taken' },
      { status: 409 }
    )
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { username: trimmedUsername },
    })

    return Response.json({
      success: true,
      username: trimmedUsername,
    })
  } catch (err: any) {
    // Handle unique constraint violation (race condition)
    if (err.code === 'P2002') {
      return Response.json(
        { success: false, error: 'USERNAME_TAKEN', message: 'This username is already taken' },
        { status: 409 }
      )
    }
    console.error('Username update failed:', err)
    return Response.json(
      { success: false, error: 'UPDATE_FAILED', message: 'Failed to update username' },
      { status: 500 }
    )
  }
}

/** DELETE /api/profile/username - Remove username */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { username: null },
    })

    return Response.json({ success: true })
  } catch (err: any) {
    console.error('Username deletion failed:', err)
    return Response.json(
      { success: false, error: 'DELETE_FAILED', message: 'Failed to remove username' },
      { status: 500 }
    )
  }
}
