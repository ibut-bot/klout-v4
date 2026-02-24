import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return Response.json({ error: 'url required' }, { status: 400 })
  }

  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&theme=dark&omit_script=true&dnt=true`
    const res = await fetch(oembedUrl, { next: { revalidate: 3600 } })
    if (!res.ok) {
      return Response.json({ error: 'Failed to fetch embed' }, { status: res.status })
    }
    const data = await res.json()
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Failed to fetch embed' }, { status: 500 })
  }
}
