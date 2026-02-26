import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {},
  // Enforce request body size limits (default is 1MB; explicit is safer)
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
  async rewrites() {
    const endpoint = process.env.HETZNER_ENDPOINT_URL || 'https://hel1.your-objectstorage.com'
    const bucket = process.env.HETZNER_BUCKET_NAME || 'openclaw83'
    return [
      {
        source: '/storage/:path*',
        destination: `${endpoint}/${bucket}/:path*`,
      },
    ]
  },
}

export default nextConfig
