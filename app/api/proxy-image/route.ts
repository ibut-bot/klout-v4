import { NextRequest } from 'next/server'
import https from 'https'
import http from 'http'

/**
 * GET /api/proxy-image?url=<encoded-url>
 * Proxies an image from our S3 bucket to avoid CORS issues with canvas.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return new Response('Missing url param', { status: 400 })
  }

  // Only allow proxying images from our S3 bucket
  const allowedHost = process.env.HETZNER_ENDPOINT_URL || 'https://hel1.your-objectstorage.com'
  if (!url.startsWith(allowedHost)) {
    return new Response('URL not allowed', { status: 403 })
  }

  try {
    // Use Node http/https to force IPv4 (same issue as S3 client)
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http
      const req = mod.get(url, { family: 4 }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Upstream returned ${res.statusCode}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')) })
    })

    const ext = url.split('.').pop()?.toLowerCase()
    const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err: any) {
    console.error('[proxy-image] Failed to fetch:', err.message)
    return new Response(`Failed to fetch image: ${err.message}`, { status: 502 })
  }
}
