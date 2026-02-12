/**
 * Update or remove campaign image
 * 
 * Usage:
 *   npm run skill:tasks:image -- --task "task-uuid" --image "/path/to/image.jpg" --password "pass"
 *   npm run skill:tasks:image -- --task "task-uuid" --remove --password "pass"
 * 
 * Arguments:
 *   --task       Task ID to update
 *   --image      Path to new image file (optional, mutually exclusive with --remove)
 *   --remove     Remove the current image (optional, mutually exclusive with --image)
 *   --password   Wallet password for authentication
 */

import { apiRequest, parseArgs, uploadFile } from './lib/api-client'
import { loadKeypair } from './lib/wallet'

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.task || !args.password) {
    return {
      success: false,
      error: 'MISSING_ARGS',
      message: 'Required: --task, --password',
      usage: 'npm run skill:tasks:image -- --task "uuid" --password "pass" [--image "/path/to/image.jpg" | --remove]',
    }
  }

  if (args.image && args.remove) {
    return {
      success: false,
      error: 'INVALID_ARGS',
      message: 'Cannot use both --image and --remove. Choose one.',
    }
  }

  if (!args.image && !args.remove) {
    return {
      success: false,
      error: 'MISSING_ARGS',
      message: 'Must specify either --image or --remove',
      usage: 'npm run skill:tasks:image -- --task "uuid" --password "pass" [--image "/path/to/image.jpg" | --remove]',
    }
  }

  // Load keypair
  const keypair = loadKeypair(args.password)
  if (!keypair) {
    return {
      success: false,
      error: 'WALLET_NOT_FOUND',
      message: 'Could not load wallet. Check password and wallet location.',
    }
  }

  let imageUrl: string | null = null

  // Upload new image if provided
  if (args.image) {
    console.error(`Uploading image: ${args.image}...`)
    const uploadResult = await uploadFile(keypair, args.image)
    
    if (!uploadResult.success) {
      return {
        success: false,
        error: 'UPLOAD_FAILED',
        message: uploadResult.message || 'Failed to upload image',
        details: uploadResult,
      }
    }
    
    imageUrl = uploadResult.url
    console.error(`Image uploaded: ${imageUrl}`)
  }

  // Update the task
  console.error(`Updating task ${args.task}...`)
  const result = await apiRequest(keypair, `/api/tasks/${args.task}`, {
    method: 'PATCH',
    body: JSON.stringify({ imageUrl }),
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'UPDATE_FAILED',
      message: result.message || 'Failed to update task image',
    }
  }

  return {
    success: true,
    message: args.remove ? 'Campaign image removed' : 'Campaign image updated',
    taskId: args.task,
    imageUrl: result.task?.imageUrl || null,
  }
}

main()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.success ? 0 : 1)
  })
  .catch((err) => {
    console.log(JSON.stringify({
      success: false,
      error: 'UNEXPECTED_ERROR',
      message: err.message,
    }, null, 2))
    process.exit(1)
  })
