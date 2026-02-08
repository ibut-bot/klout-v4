import { S3Client } from '@aws-sdk/client-s3'

export const s3 = new S3Client({
  region: 'hel1',
  endpoint: process.env.HETZNER_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.HETZNER_ACCESS_KEY!,
    secretAccessKey: process.env.HETZNER_SECRET_KEY!,
  },
  forcePathStyle: true,
})

export const BUCKET_NAME = process.env.HETZNER_BUCKET_NAME!
