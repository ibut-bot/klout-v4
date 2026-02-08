import { NextRequest } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomBytes } from 'crypto'
import { requireAuth } from '@/lib/api-helpers'
import { s3, BUCKET_NAME } from '@/lib/s3'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

const ALLOWED_TYPES: Record<string, string> = {
  // Images
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  // Video
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
}

export async function POST(request: NextRequest) {
  // Authenticate
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

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
      { success: false, error: 'FILE_TOO_LARGE', message: 'Maximum file size is 100 MB' },
      { status: 400 }
    )
  }

  // Build unique key: uploads/<wallet>/<random>.<ext>
  const key = `uploads/${auth.wallet}/${randomBytes(16).toString('hex')}.${ext}`

  try {
    const buffer = Buffer.from(await file.arrayBuffer())

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

    return Response.json({
      success: true,
      url,
      key,
      contentType: file.type,
      size: file.size,
    })
  } catch (err: any) {
    console.error('S3 upload failed:', err)
    return Response.json(
      { success: false, error: 'UPLOAD_FAILED', message: 'Failed to upload file' },
      { status: 500 }
    )
  }
}
