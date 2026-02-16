import { fal } from '@fal-ai/client'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomBytes } from 'crypto'
import { s3, BUCKET_NAME } from './s3'

fal.config({
  credentials: process.env.FAL_API_KEY || '',
})

/** Score-based buffness prompt tiers — muscular athletic is the floor, max stays the same */
function getBuffedPrompt(score: number): { prompt: string; guidance: number } {
  if (score <= 20) {
    return {
      prompt:
        'Transform this person into a muscular athletic physique. ' +
        'Visible biceps, strong shoulders, defined arms. Like a regular gym enthusiast. ' +
        'Keep the exact same face and identity.',
      guidance: 3.0,
    }
  }
  if (score <= 35) {
    return {
      prompt:
        'Transform this person into a very muscular and ripped physique. ' +
        'Big arms, broad shoulders, visible muscle striations, powerful stance. ' +
        'Like a competitive fitness model. Keep the exact same face and identity.',
      guidance: 3.5,
    }
  }
  if (score <= 50) {
    return {
      prompt:
        'Transform this person into an extremely muscular and jacked bodybuilder physique. ' +
        'Huge biceps, massive shoulders, veins visible, incredibly powerful and intimidating. ' +
        'Like a professional bodybuilder. Keep the exact same face and identity. Dramatic lighting.',
      guidance: 3.5,
    }
  }
  if (score <= 65) {
    return {
      prompt:
        'Transform this person into an insanely jacked superhuman bodybuilder. ' +
        'Impossibly huge muscles, veins popping everywhere, neck as wide as head, ' +
        'traps touching ears, arms bigger than most people\'s legs. ' +
        'Absolutely monstrous physique. Keep the exact same face and identity. Epic dramatic lighting.',
      guidance: 4.0,
    }
  }
  // 66-100: godlike max
  return {
    prompt:
      'Transform this person into a godlike impossibly gigantic ultra-muscular titan. ' +
      'Muscles on top of muscles, every single vein visible, neck wider than head, ' +
      'shoulders so broad they don\'t fit in frame, absolutely cartoonishly massive physique. ' +
      'Like a Greek god of gains crossed with the Hulk. ' +
      'Keep the exact same face and identity. Golden hour epic dramatic lighting, glowing aura.',
    guidance: 4.5,
  }
}

function getGenericBuffedPrompt(score: number): string {
  if (score <= 20) {
    return 'A muscular ripped Pepe the frog bodybuilder flexing big biceps, wearing gold chain and sunglasses, strong crypto bro aesthetic, digital art, vibrant colors'
  }
  if (score <= 35) {
    return 'A jacked massive Pepe the frog professional bodybuilder, huge muscles, veins popping, wearing a diamond chain, crypto king vibes, dramatic lighting, digital art'
  }
  if (score <= 50) {
    return 'An insanely jacked superhuman Pepe the frog with impossibly huge muscles, veins everywhere, glowing eyes, wearing a crown, crypto god tier, epic dramatic lighting, digital art'
  }
  if (score <= 65) {
    return 'A godlike gigantic ultra-muscular Pepe the frog titan with muscles on muscles, golden glowing aura, wearing a diamond crown and cape, absolute crypto deity, world-bending energy, epic golden dramatic lighting, digital art masterpiece'
  }
  // 66-100: godlike max
  return 'A godlike gigantic ultra-muscular Pepe the frog titan with muscles on muscles, golden glowing aura, wearing a diamond crown and cape, absolute crypto deity, world-bending energy, epic golden dramatic lighting, digital art masterpiece'
}

function isDefaultTwitterAvatar(url: string | null | undefined): boolean {
  if (!url) return true
  return url.includes('default_profile_images') || url.includes('default_profile')
}

function getHighResProfileUrl(url: string): string {
  return url.replace(/_normal\./, '_400x400.')
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`)
  const contentType = res.headers.get('content-type') || 'image/png'
  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, contentType }
}

async function uploadToS3(buffer: Buffer, contentType: string, folder: string): Promise<string> {
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'
  const key = `${folder}/${randomBytes(16).toString('hex')}.${ext}`

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    })
  )

  return `${process.env.HETZNER_ENDPOINT_URL}/${BUCKET_NAME}/${key}`
}

/**
 * Generate a buffed version of a Twitter profile image using fal.ai img2img.
 * Buffness scales with score — shifted one tier up from original, max stays the same.
 */
export async function generateBuffedProfileImage(
  profileImageUrl: string | null | undefined,
  xUsername: string,
  score: number
): Promise<string | null> {
  try {
    if (isDefaultTwitterAvatar(profileImageUrl)) {
      return await generateGenericBuffedImage(xUsername, score)
    }

    const highResUrl = getHighResProfileUrl(profileImageUrl!)
    const { prompt, guidance } = getBuffedPrompt(score)

    const result = await fal.subscribe('fal-ai/flux-2/turbo/edit', {
      input: {
        prompt,
        image_urls: [highResUrl],
        image_size: { width: 512, height: 512 },
        num_images: 1,
        guidance_scale: guidance,
        output_format: 'png',
      },
    })

    const outputUrl = (result.data as any)?.images?.[0]?.url
    if (!outputUrl) {
      console.warn('[fal] No output image, falling back to generic')
      return await generateGenericBuffedImage(xUsername, score)
    }

    const { buffer, contentType } = await downloadImage(outputUrl)
    return await uploadToS3(buffer, contentType, `buffed/${xUsername}`)
  } catch (err) {
    console.error('[fal] Buffed image generation failed:', err)
    try {
      return await generateGenericBuffedImage(xUsername, score)
    } catch {
      return null
    }
  }
}

async function generateGenericBuffedImage(xUsername: string, score: number): Promise<string | null> {
  try {
    const prompt = getGenericBuffedPrompt(score)

    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt,
        image_size: { width: 512, height: 512 },
        num_images: 1,
      },
    })

    const outputUrl = (result.data as any)?.images?.[0]?.url
    if (!outputUrl) return null

    const { buffer, contentType } = await downloadImage(outputUrl)
    return await uploadToS3(buffer, contentType, `buffed/${xUsername}`)
  } catch (err) {
    console.error('[fal] Generic buffed image generation failed:', err)
    return null
  }
}
