import { NextRequest } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomBytes } from 'crypto'
import { requireAuth } from '@/lib/api-helpers'
import { rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { s3, BUCKET_NAME } from '@/lib/s3'
import { execFile } from 'child_process'
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

const ALLOWED_TYPES: Record<string, string> = {
  // Images (SVG intentionally excluded — can contain embedded scripts / XSS)
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  // Video
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
}

const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'])

/**
 * Transcode any video to browser-friendly H.264/AAC MP4 using ffmpeg.
 * If the input is already H.264, ffmpeg will still run but with -c:v copy (fast).
 * Returns the transcoded buffer, or null if ffmpeg is not available.
 */
async function transcodeToH264(inputBuffer: Buffer): Promise<Buffer<ArrayBuffer> | null> {
  let dir: string | null = null
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'upload-'))
    const inputPath = path.join(dir, 'input')
    const outputPath = path.join(dir, 'output.mp4')

    await writeFile(inputPath, inputBuffer)

    await new Promise<void>((resolve, reject) => {
      execFile(
        'ffmpeg',
        [
          '-i', inputPath,
          '-c:v', 'libx264',     // Re-encode video to H.264
          '-preset', 'fast',      // Good speed/quality tradeoff
          '-crf', '23',           // Reasonable quality
          '-c:a', 'aac',         // Re-encode audio to AAC
          '-movflags', '+faststart', // Move moov atom to beginning for streaming
          '-y',                   // Overwrite output
          outputPath,
        ],
        { timeout: 120_000 }, // 2 minute timeout
        (error, _stdout, stderr) => {
          if (error) {
            console.error('ffmpeg stderr:', stderr)
            reject(error)
          } else {
            resolve()
          }
        }
      )
    })

    return await readFile(outputPath) as Buffer<ArrayBuffer>
  } catch (err) {
    console.error('Transcode failed (will upload original):', err)
    return null
  } finally {
    // Clean up temp files
    if (dir) {
      try {
        const inputPath = path.join(dir, 'input')
        const outputPath = path.join(dir, 'output.mp4')
        await unlink(inputPath).catch(() => {})
        await unlink(outputPath).catch(() => {})
        const { rmdir } = await import('fs/promises')
        await rmdir(dir).catch(() => {})
      } catch { /* ignore cleanup errors */ }
    }
  }
}

export async function POST(request: NextRequest) {
  // Authenticate
  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  // Rate limit uploads
  const rl = rateLimitResponse(`upload:${auth.wallet}`, RATE_LIMITS.upload)
  if (rl) return rl

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

  try {
    let buffer: Buffer<ArrayBuffer> = Buffer.from(await file.arrayBuffer())
    let contentType = file.type
    let finalExt = ext

    // Transcode videos to H.264 MP4 for browser compatibility
    if (VIDEO_TYPES.has(file.type)) {
      const transcoded = await transcodeToH264(buffer)
      if (transcoded) {
        buffer = transcoded
        contentType = 'video/mp4'
        finalExt = 'mp4'
      }
      // If transcode fails, we still upload the original
    }

    // Build unique key: uploads/<wallet>/<random>.<ext>
    const key = `uploads/${auth.wallet}/${randomBytes(16).toString('hex')}.${finalExt}`

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
      })
    )

    const url = `${process.env.HETZNER_ENDPOINT_URL}/${BUCKET_NAME}/${key}`

    return Response.json({
      success: true,
      url,
      key,
      contentType,
      size: buffer.length,
    })
  } catch (err: any) {
    console.error('S3 upload failed:', err)
    return Response.json(
      { success: false, error: 'UPLOAD_FAILED', message: 'Failed to upload file' },
      { status: 500 }
    )
  }
}
