import { S3Client } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import https from 'https'

// Force IPv4 to avoid IPv6 timeout issues
const agent = new https.Agent({
  family: 4, // Force IPv4
  keepAlive: true,
})

export const s3 = new S3Client({
  region: 'hel1',
  endpoint: process.env.HETZNER_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.HETZNER_ACCESS_KEY!,
    secretAccessKey: process.env.HETZNER_SECRET_KEY!,
  },
  forcePathStyle: true,
  requestHandler: new NodeHttpHandler({
    httpsAgent: agent,
  }),
})

export const BUCKET_NAME = process.env.HETZNER_BUCKET_NAME!
