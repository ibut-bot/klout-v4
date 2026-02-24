import { NextRequest } from 'next/server'

const ALLOWED_HOSTS = ['video.twimg.com', 'pbs.twimg.com']

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return new Response('url required', { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new Response('invalid url', { status: 400 })
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new Response('host not allowed', { status: 403 })
  }

  const rangeHeader = request.headers.get('range')
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; KloutBot/1.0)',
  }
  if (rangeHeader) {
    headers['Range'] = rangeHeader
  }

  try {
    const upstream = await fetch(url, { headers })

    if (!upstream.ok && upstream.status !== 206) {
      return new Response('upstream error', { status: upstream.status })
    }

    const responseHeaders = new Headers()
    const contentType = upstream.headers.get('content-type')
    if (contentType) responseHeaders.set('Content-Type', contentType)

    const contentLength = upstream.headers.get('content-length')
    if (contentLength) responseHeaders.set('Content-Length', contentLength)

    const contentRange = upstream.headers.get('content-range')
    if (contentRange) responseHeaders.set('Content-Range', contentRange)

    const acceptRanges = upstream.headers.get('accept-ranges')
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges)
    else responseHeaders.set('Accept-Ranges', 'bytes')

    responseHeaders.set('Cache-Control', 'public, max-age=86400')

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch {
    return new Response('fetch failed', { status: 502 })
  }
}
