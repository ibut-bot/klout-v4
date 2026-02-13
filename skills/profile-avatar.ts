#!/usr/bin/env tsx
/**
 * Manage profile avatar (picture) for authenticated user
 *
 * Usage:
 *   npm run skill:profile:get -- --password "mypass"
 *   npm run skill:profile:upload -- --file "/path/to/image.jpg" --password "mypass"
 *   npm run skill:profile:remove -- --password "mypass"
 *
 * Options:
 *   --password   Wallet password
 *   --file       Path to image file (for upload)
 *   --action     Action: get, upload, remove (default: get)
 */

import * as fs from 'fs'
import * as path from 'path'
import { getKeypair } from './lib/wallet'
import { getToken, parseArgs } from './lib/api-client'

function getBaseUrl(): string {
  return process.env.SLOPWORK_API_URL || 'https://klout.gg'
}

async function getProfile(token: string): Promise<any> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/api/profile/avatar`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  return res.json()
}

async function uploadAvatar(token: string, filePath: string): Promise<any> {
  const base = getBaseUrl()

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }

  const fileBuffer = fs.readFileSync(filePath)
  const filename = path.basename(filePath)

  // Determine content type from extension
  const ext = path.extname(filePath).toLowerCase().slice(1)
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  const contentType = mimeTypes[ext]
  if (!contentType) {
    throw new Error(`Unsupported file type: ${ext}. Supported: jpg, jpeg, png, gif, webp`)
  }

  // Build multipart form data manually (Node.js compatible)
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2)
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`

  const body = Buffer.concat([
    Buffer.from(header),
    fileBuffer,
    Buffer.from(footer),
  ])

  const res = await fetch(`${base}/api/profile/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  return res.json()
}

async function removeAvatar(token: string): Promise<any> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/api/profile/avatar`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  })
  return res.json()
}

async function main() {
  const args = parseArgs()

  if (!args.password) {
    console.log(JSON.stringify({
      success: false,
      error: 'PASSWORD_REQUIRED',
      message: 'Please provide --password',
      usage: 'npm run skill:profile:get -- --password "yourpass"',
    }))
    process.exit(1)
  }

  const action = args.action || 'get'

  try {
    const keypair = getKeypair(args.password)
    const token = await getToken(keypair)

    let result: any

    switch (action) {
      case 'get':
        result = await getProfile(token)
        if (result.success) {
          console.log(JSON.stringify({
            success: true,
            wallet: result.walletAddress,
            username: result.username,
            profilePicUrl: result.profilePicUrl,
            message: result.profilePicUrl ? 'Profile picture found' : 'No profile picture set',
          }))
        } else {
          console.log(JSON.stringify(result))
        }
        break

      case 'upload':
        if (!args.file) {
          console.log(JSON.stringify({
            success: false,
            error: 'FILE_REQUIRED',
            message: 'Please provide --file path to image',
            usage: 'npm run skill:profile:upload -- --file "/path/to/image.jpg" --password "yourpass"',
          }))
          process.exit(1)
        }
        result = await uploadAvatar(token, args.file)
        if (result.success) {
          console.log(JSON.stringify({
            success: true,
            url: result.url,
            message: 'Profile picture uploaded successfully',
          }))
        } else {
          console.log(JSON.stringify(result))
        }
        break

      case 'remove':
        result = await removeAvatar(token)
        if (result.success) {
          console.log(JSON.stringify({
            success: true,
            message: 'Profile picture removed successfully',
          }))
        } else {
          console.log(JSON.stringify(result))
        }
        break

      default:
        console.log(JSON.stringify({
          success: false,
          error: 'INVALID_ACTION',
          message: `Unknown action: ${action}. Use: get, upload, remove`,
        }))
        process.exit(1)
    }
  } catch (e: any) {
    console.log(JSON.stringify({
      success: false,
      error: 'OPERATION_FAILED',
      message: e.message || String(e),
    }))
    process.exit(1)
  }
}

main()
