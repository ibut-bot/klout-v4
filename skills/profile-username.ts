#!/usr/bin/env tsx
/**
 * Manage profile username for authenticated user
 *
 * Usage:
 *   npm run skill:username:get -- --password "mypass"
 *   npm run skill:username:set -- --username "myusername" --password "mypass"
 *   npm run skill:username:remove -- --password "mypass"
 *
 * Options:
 *   --password   Wallet password
 *   --username   Username to set (3-20 chars, alphanumeric and underscores only)
 *   --action     Action: get, set, remove (default: get)
 */

import { getKeypair } from './lib/wallet'
import { getToken, parseArgs } from './lib/api-client'

function getBaseUrl(): string {
  return process.env.SLOPWORK_API_URL || 'https://klout.gg'
}

async function getUsername(token: string): Promise<any> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/api/profile/username`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  return res.json()
}

async function setUsername(token: string, username: string): Promise<any> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/api/profile/username`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username }),
  })
  return res.json()
}

async function removeUsername(token: string): Promise<any> {
  const base = getBaseUrl()
  const res = await fetch(`${base}/api/profile/username`, {
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
      usage: 'npm run skill:username:get -- --password "yourpass"',
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
        result = await getUsername(token)
        if (result.success) {
          console.log(JSON.stringify({
            success: true,
            username: result.username,
            message: result.username ? `Username: ${result.username}` : 'No username set',
          }))
        } else {
          console.log(JSON.stringify(result))
        }
        break

      case 'set':
        if (!args.username) {
          console.log(JSON.stringify({
            success: false,
            error: 'USERNAME_REQUIRED',
            message: 'Please provide --username',
            usage: 'npm run skill:username:set -- --username "myusername" --password "yourpass"',
          }))
          process.exit(1)
        }
        result = await setUsername(token, args.username)
        if (result.success) {
          console.log(JSON.stringify({
            success: true,
            username: result.username,
            message: `Username set to: ${result.username}`,
          }))
        } else {
          console.log(JSON.stringify(result))
        }
        break

      case 'remove':
        result = await removeUsername(token)
        if (result.success) {
          console.log(JSON.stringify({
            success: true,
            message: 'Username removed successfully',
          }))
        } else {
          console.log(JSON.stringify(result))
        }
        break

      default:
        console.log(JSON.stringify({
          success: false,
          error: 'INVALID_ACTION',
          message: `Unknown action: ${action}. Use: get, set, remove`,
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
