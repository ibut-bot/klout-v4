import puppeteer, { type Browser } from 'puppeteer-core'

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const WALLCHAIN_API = 'https://api.wallchain.xyz/extension/x_score/score'
const WALLCHAIN_DEV_API = process.env.WALLCHAIN_DEV_API_URL || 'https://dev.api.wallchains.com/extension/x_score/score'
const DIRECT_FETCH_TIMEOUT_MS = 8_000
const PUPPETEER_TIMEOUT_MS = 25_000
const DEV_FETCH_TIMEOUT_MS = 10_000

let browserInstance: Browser | null = null
let browserLaunchPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.connected) return browserInstance

  if (browserLaunchPromise) return browserLaunchPromise

  browserLaunchPromise = (async () => {
    if (browserInstance) {
      try { await browserInstance.close() } catch {}
      browserInstance = null
    }

    browserInstance = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'shell',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    })

    return browserInstance
  })().finally(() => { browserLaunchPromise = null })

  return browserLaunchPromise
}

function parseWallchainResponse(text: string): number {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Klout score fetch returned an unexpected response — please try again: ${text.substring(0, 200)}`)
  }

  if (typeof data.score !== 'number') {
    throw new Error(`Klout score fetch returned an incomplete response — please try again: ${JSON.stringify(data).substring(0, 200)}`)
  }

  return data.score
}

export async function fetchWallchainScore(xUsername: string): Promise<number> {
  const url = `${WALLCHAIN_API}/${encodeURIComponent(xUsername)}`

  // Fast path: direct fetch (works when Cloudflare isn't challenging)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DIRECT_FETCH_TIMEOUT_MS)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    })
    clearTimeout(timer)

    if (res.ok) {
      const text = await res.text()
      if (!text.includes('Just a moment') && !text.includes('challenge-platform') && !text.includes('<!DOCTYPE')) {
        console.log('[wallchain] Direct fetch succeeded')
        return parseWallchainResponse(text)
      }
    }
    console.log('[wallchain] Direct fetch got Cloudflare challenge, falling back to Puppeteer')
  } catch (err: any) {
    console.log('[wallchain] Direct fetch failed, falling back to Puppeteer:', err.message)
  }

  // Slow path: Puppeteer to bypass Cloudflare
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Klout score fetch timed out')), PUPPETEER_TIMEOUT_MS)
    )
    return await Promise.race([fetchViaP(url), timeout])
  } catch (err: any) {
    console.log('[wallchain] Puppeteer failed, falling back to dev API:', err.message)
  }

  // Last resort: dev API (no Cloudflare)
  return fetchViaDev(xUsername)
}

async function fetchViaP(url: string): Promise<number> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    )

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })

    let challengeSolved = false
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const content = await page.content()
      if (!content.includes('Just a moment') && !content.includes('challenge-platform')) {
        challengeSolved = true
        break
      }
    }

    if (!challengeSolved) {
      throw new Error('Klout score fetch failed — please try again')
    }

    const text = await page.evaluate(() => document.body.innerText)
    return parseWallchainResponse(text)
  } finally {
    await page.close().catch(() => {})
  }
}

async function fetchViaDev(xUsername: string): Promise<number> {
  const url = `${WALLCHAIN_DEV_API}/${encodeURIComponent(xUsername)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEV_FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    })
    clearTimeout(timer)

    if (!res.ok) {
      throw new Error(`Dev API returned ${res.status}`)
    }

    const text = await res.text()
    console.log('[wallchain] Dev API fetch succeeded')
    return parseWallchainResponse(text)
  } catch (err: any) {
    clearTimeout(timer)
    throw new Error(`Klout score fetch failed on all attempts — please try again: ${err.message}`)
  }
}

export function applyScoreDeviation(baseScore: number): number {
  const deviation = 1 + (Math.random() * 0.10 - 0.05) // ±5%
  return Math.max(0, Math.min(10_000, Math.round(baseScore * deviation)))
}

/**
 * Penalty based on following/followers ratio:
 *   ratio <= 0.5  → no penalty (×1.0)
 *   ratio  = 0.5  → 25% penalty (×0.75)
 *   ratio  = 1.0+ → 75% penalty (×0.25)
 *   between 0.5–1.0 → linear gradient from ×0.75 → ×0.25
 */
export function followRatioMultiplier(followers: number, following: number): number {
  if (followers === 0) return 0.25
  const ratio = following / followers
  if (ratio <= 0.5) return 1.0
  if (ratio >= 1.0) return 0.25
  const t = (ratio - 0.5) / 0.5
  return 0.75 - t * 0.50
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}
