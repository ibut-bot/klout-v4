import puppeteer, { type Browser } from 'puppeteer-core'

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const WALLCHAIN_API = 'https://api.wallchain.xyz/extension/x_score/score'
const WALLCHAIN_TIMEOUT_MS = 25_000

let browserInstance: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (browserInstance) {
    try {
      if (browserInstance.connected) return browserInstance
    } catch { /* browser crashed */ }
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
}

export async function fetchWallchainScore(xUsername: string): Promise<number> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Klout score fetch timed out')), WALLCHAIN_TIMEOUT_MS)
  )
  return Promise.race([fetchWallchainScoreInner(xUsername), timeout])
}

async function fetchWallchainScoreInner(xUsername: string): Promise<number> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    )

    const url = `${WALLCHAIN_API}/${encodeURIComponent(xUsername)}`
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
  } finally {
    await page.close().catch(() => {})
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
