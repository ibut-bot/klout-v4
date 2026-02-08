import { NextRequest } from 'next/server'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomBytes } from 'crypto'
import { requireAuth } from '@/lib/api-helpers'
import { s3, BUCKET_NAME } from '@/lib/s3'
import { prisma } from '@/lib/db'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB for profile pics

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/** POST /api/profile/avatar - Upload profile picture */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { wallet, userId } = auth

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json(
      { success: false, error: 'INVALID_FORM_DATA', message: 'Request must be multipart/form-data' },
      { status: 400 }
    )
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return Response.json(
      { success: false, error: 'NO_FILE', message: 'A "file" field is required' },
      { status: 400 }
    )
  }

  // Validate type
  const ext = ALLOWED_TYPES[file.type]
  if (!ext) {
    return Response.json(
      { success: false, error: 'INVALID_FILE_TYPE', message: `Allowed types: ${Object.keys(ALLOWED_TYPES).join(', ')}` },
      { status: 400 }
    )
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { success: false, error: 'FILE_TOO_LARGE', message: 'Maximum file size is 5 MB' },
      { status: 400 }
    )
  }

  // Build unique key: avatars/<wallet>/<random>.<ext>
  const key = `avatars/${wallet}/${randomBytes(16).toString('hex')}.${ext}`

  try {
    const buffer = Buffer.from(await file.arrayBuffer())

    // Get current user to check for existing avatar
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const oldAvatarUrl = user?.profilePicUrl

    // Upload new avatar
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        ACL: 'public-read',
      })
    )

    const url = `${process.env.HETZNER_ENDPOINT_URL}/${BUCKET_NAME}/${key}`

    // Update user profile
    await prisma.user.update({
      where: { id: userId },
      data: { profilePicUrl: url },
    })

    // Delete old avatar from S3 if exists
    if (oldAvatarUrl) {
      try {
        const oldKey = oldAvatarUrl.split(`${BUCKET_NAME}/`)[1]
        if (oldKey) {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: oldKey,
            })
          )
        }
      } catch {
        // Ignore deletion errors
      }
    }

    return Response.json({
      success: true,
      url,
    })
  } catch (err: any) {
    console.error('Avatar upload failed:', err)
    return Response.json(
      { success: false, error: 'UPLOAD_FAILED', message: 'Failed to upload avatar' },
      { status: 500 }
    )
  }
}

/** DELETE /api/profile/avatar - Remove profile picture */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId } = auth

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user?.profilePicUrl) {
      return Response.json({ success: true, message: 'No avatar to remove' })
    }

    // Delete from S3
    const key = user.profilePicUrl.split(`${BUCKET_NAME}/`)[1]
    if (key) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        })
      )
    }

    // Update user profile
    await prisma.user.update({
      where: { id: userId },
      data: { profilePicUrl: null },
    })

    return Response.json({ success: true })
  } catch (err: any) {
    console.error('Avatar deletion failed:', err)
    return Response.json(
      { success: false, error: 'DELETE_FAILED', message: 'Failed to delete avatar' },
      { status: 500 }
    )
  }
}

/** GET /api/profile/avatar - Get current user's profile info */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth
  const { userId, wallet } = auth

  const user = await prisma.user.findUnique({ where: { id: userId } })

  return Response.json({
    success: true,
    profilePicUrl: user?.profilePicUrl || null,
    walletAddress: wallet,
  })
}
