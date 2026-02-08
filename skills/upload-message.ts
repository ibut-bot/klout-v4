#!/usr/bin/env tsx
/**
 * Upload file(s) and send as a message on a task
 *
 * Usage:
 *   npm run skill:messages:upload -- --task "uuid" --file "/path/to/image.png" --password "pass"
 *   npm run skill:messages:upload -- --task "uuid" --file "/path/to/image.png" --message "Here's the screenshot" --password "pass"
 *
 * Supports images (jpg, png, gif, webp, svg) and videos (mp4, webm, mov, avi, mkv)
 * Max file size: 100 MB
 */

import { getKeypair } from './lib/wallet'
import { apiRequest, uploadFile, parseArgs } from './lib/api-client'

async function main() {
  const args = parseArgs()
  if (!args.task || !args.file || !args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --file, --password. Optional: --message',
      usage: 'npm run skill:messages:upload -- --task "uuid" --file "/path/to/file" --password "pass"',
    }))
    process.exit(1)
  }

  try {
    const keypair = getKeypair(args.password)

    // Step 1: Upload the file
    console.error(`Uploading ${args.file}...`)
    const uploadResult = await uploadFile(keypair, args.file)

    if (!uploadResult.success) {
      console.log(JSON.stringify({
        success: false,
        error: 'UPLOAD_FAILED',
        message: uploadResult.message || 'Failed to upload file',
        details: uploadResult,
      }))
      process.exit(1)
    }

    // Step 2: Send message with attachment
    const attachment = {
      url: uploadResult.url,
      key: uploadResult.key,
      contentType: uploadResult.contentType,
      size: uploadResult.size,
      filename: args.file.split('/').pop(),
    }

    const messageBody: any = {
      attachments: [attachment],
    }
    if (args.message) {
      messageBody.content = args.message
    }

    const result = await apiRequest(keypair, 'POST', `/api/tasks/${args.task}/messages`, messageBody)
    console.log(JSON.stringify(result))
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'UPLOAD_MESSAGE_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
