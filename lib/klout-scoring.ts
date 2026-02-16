import type { XUserProfileFull, XTweetMetrics } from './x-api'

// ── Score Components ──

export interface ScoreBreakdown {
  reachScore: number        // 0–1
  ratioScore: number        // 0–0.15
  engagementScore: number   // 0–1
  verificationScore: number // 0–0.10
  geoMultiplier: number     // 0.15–1.0
  geoTier: number | null    // 1–4 or null
  geoRegion: string | null
  qualityScore: number      // reach * engagement + ratio + verification
  totalScore: number        // qualityScore * geoMultiplier * 100 (capped at 100)
}

// ── Reach Score (0–1) based on follower count ──

function computeReachScore(followers: number): number {
  if (followers >= 100_000) return 1.0
  if (followers >= 25_000) return 0.85
  if (followers >= 5_000) return 0.65
  if (followers >= 1_000) return 0.45
  if (followers >= 500) return 0.25
  return 0.10
}

// ── Follower/Following Ratio Score (0–0.15) ──

function computeRatioScore(followers: number, following: number): number {
  if (following === 0) return 0.15 // Infinite ratio = strong signal
  const ratio = followers / following
  if (ratio >= 5) return 0.15
  if (ratio >= 2) return 0.10
  if (ratio >= 1) return 0.06
  if (ratio >= 0.5) return 0.03
  return 0
}

// ── Engagement Score (0–1) based on engagement rate ──

function computeEngagementScore(
  avgLikes: number,
  avgRetweets: number,
  avgReplies: number,
  followers: number
): number {
  if (followers === 0) return 0.10
  const engagementRate = ((avgLikes + avgRetweets + avgReplies) / followers) * 100
  if (engagementRate >= 6) return 1.0
  if (engagementRate >= 3) return 0.80
  if (engagementRate >= 1) return 0.55
  if (engagementRate >= 0.5) return 0.30
  return 0.10
}

// ── Verification Score (0–0.10) ──

function computeVerificationScore(verifiedType: string | null): number {
  if (!verifiedType) return 0
  if (verifiedType === 'business' || verifiedType === 'government') return 0.10
  if (verifiedType === 'blue') return 0.05
  return 0
}

// ── Geographic Tier & Multiplier ──

const TIER_1_MULTIPLIER = 1.0
const TIER_2_MULTIPLIER = 0.75
const TIER_3_MULTIPLIER = 0.45
const TIER_4_MULTIPLIER = 0.15
const UNKNOWN_MULTIPLIER = 0.35

// Country codes → tiers
const TIER_1_COUNTRIES = new Set([
  'US', 'CA',
])

const TIER_2_COUNTRIES = new Set([
  // Western Europe
  'GB', 'UK', 'DE', 'FR', 'NL', 'BE', 'LU', 'AT', 'CH', 'IE', 'DK', 'SE', 'NO', 'FI', 'IS',
  'IT', 'ES', 'PT',
  // Australia & New Zealand
  'AU', 'NZ',
])

const TIER_3_COUNTRIES = new Set([
  // Eastern Europe
  'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'HR', 'SI', 'RS', 'BA', 'ME', 'MK', 'AL', 'XK',
  'EE', 'LV', 'LT', 'UA', 'MD', 'BY', 'RU',
  // Asia
  'JP', 'KR', 'CN', 'TW', 'HK', 'SG', 'MY', 'TH', 'VN', 'PH', 'ID', 'IN', 'PK', 'BD',
  'LK', 'NP', 'MM', 'KH', 'LA', 'MN', 'KZ', 'UZ', 'TM', 'KG', 'TJ',
  // Middle East
  'AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'IL', 'TR', 'JO', 'LB', 'IQ', 'IR',
])

// City/region → country code lookup (common strings people put in X location)
const LOCATION_LOOKUP: Record<string, string> = {
  // US cities
  'new york': 'US', 'nyc': 'US', 'los angeles': 'US', 'la': 'US', 'san francisco': 'US', 'sf': 'US',
  'chicago': 'US', 'miami': 'US', 'austin': 'US', 'seattle': 'US', 'boston': 'US', 'denver': 'US',
  'atlanta': 'US', 'dallas': 'US', 'houston': 'US', 'phoenix': 'US', 'portland': 'US',
  'san diego': 'US', 'philadelphia': 'US', 'washington': 'US', 'dc': 'US', 'washington dc': 'US',
  'nashville': 'US', 'las vegas': 'US', 'detroit': 'US', 'minneapolis': 'US', 'charlotte': 'US',
  'san jose': 'US', 'columbus': 'US', 'indianapolis': 'US', 'jacksonville': 'US', 'memphis': 'US',
  'brooklyn': 'US', 'manhattan': 'US', 'queens': 'US', 'bronx': 'US', 'silicon valley': 'US',
  'bay area': 'US', 'california': 'US', 'texas': 'US', 'florida': 'US', 'new jersey': 'US',
  'united states': 'US', 'usa': 'US', 'u.s.a': 'US', 'u.s.': 'US', 'america': 'US',
  // US states
  'alabama': 'US', 'alaska': 'US', 'arizona': 'US', 'arkansas': 'US', 'colorado': 'US',
  'connecticut': 'US', 'delaware': 'US', 'georgia': 'US', 'hawaii': 'US', 'idaho': 'US',
  'illinois': 'US', 'indiana': 'US', 'iowa': 'US', 'kansas': 'US', 'kentucky': 'US',
  'louisiana': 'US', 'maine': 'US', 'maryland': 'US', 'massachusetts': 'US', 'michigan': 'US',
  'minnesota': 'US', 'mississippi': 'US', 'missouri': 'US', 'montana': 'US', 'nebraska': 'US',
  'nevada': 'US', 'new hampshire': 'US', 'new mexico': 'US', 'north carolina': 'US',
  'north dakota': 'US', 'ohio': 'US', 'oklahoma': 'US', 'oregon': 'US', 'pennsylvania': 'US',
  'rhode island': 'US', 'south carolina': 'US', 'south dakota': 'US', 'tennessee': 'US',
  'utah': 'US', 'vermont': 'US', 'virginia': 'US', 'west virginia': 'US', 'wisconsin': 'US',
  'wyoming': 'US',
  // Canada
  'toronto': 'CA', 'vancouver': 'CA', 'montreal': 'CA', 'ottawa': 'CA', 'calgary': 'CA',
  'edmonton': 'CA', 'winnipeg': 'CA', 'canada': 'CA',
  // UK
  'london': 'GB', 'manchester': 'GB', 'birmingham': 'GB', 'liverpool': 'GB', 'edinburgh': 'GB',
  'glasgow': 'GB', 'bristol': 'GB', 'leeds': 'GB', 'uk': 'GB', 'united kingdom': 'GB',
  'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
  // Western Europe
  'berlin': 'DE', 'munich': 'DE', 'hamburg': 'DE', 'frankfurt': 'DE', 'germany': 'DE', 'deutschland': 'DE',
  'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR', 'france': 'FR',
  'amsterdam': 'NL', 'rotterdam': 'NL', 'netherlands': 'NL', 'holland': 'NL',
  'brussels': 'BE', 'belgium': 'BE', 'zurich': 'CH', 'geneva': 'CH', 'switzerland': 'CH',
  'vienna': 'AT', 'austria': 'AT', 'dublin': 'IE', 'ireland': 'IE',
  'copenhagen': 'DK', 'denmark': 'DK', 'stockholm': 'SE', 'sweden': 'SE',
  'oslo': 'NO', 'norway': 'NO', 'helsinki': 'FI', 'finland': 'FI',
  'rome': 'IT', 'milan': 'IT', 'italy': 'IT', 'madrid': 'ES', 'barcelona': 'ES', 'spain': 'ES',
  'lisbon': 'PT', 'portugal': 'PT', 'luxembourg': 'LU',
  // Australia & NZ
  'sydney': 'AU', 'melbourne': 'AU', 'brisbane': 'AU', 'perth': 'AU', 'adelaide': 'AU',
  'australia': 'AU', 'auckland': 'NZ', 'wellington': 'NZ', 'new zealand': 'NZ',
  // Eastern Europe
  'warsaw': 'PL', 'poland': 'PL', 'prague': 'CZ', 'czech': 'CZ', 'budapest': 'HU', 'hungary': 'HU',
  'bucharest': 'RO', 'romania': 'RO', 'sofia': 'BG', 'bulgaria': 'BG',
  'moscow': 'RU', 'russia': 'RU', 'kyiv': 'UA', 'ukraine': 'UA',
  'belgrade': 'RS', 'serbia': 'RS', 'zagreb': 'HR', 'croatia': 'HR',
  // Asia
  'tokyo': 'JP', 'osaka': 'JP', 'japan': 'JP', 'seoul': 'KR', 'korea': 'KR', 'south korea': 'KR',
  'beijing': 'CN', 'shanghai': 'CN', 'china': 'CN', 'taipei': 'TW', 'taiwan': 'TW',
  'hong kong': 'HK', 'singapore': 'SG',
  'mumbai': 'IN', 'delhi': 'IN', 'bangalore': 'IN', 'bengaluru': 'IN', 'hyderabad': 'IN',
  'chennai': 'IN', 'kolkata': 'IN', 'pune': 'IN', 'india': 'IN',
  'bangkok': 'TH', 'thailand': 'TH', 'jakarta': 'ID', 'indonesia': 'ID',
  'manila': 'PH', 'philippines': 'PH', 'kuala lumpur': 'MY', 'malaysia': 'MY',
  'ho chi minh': 'VN', 'hanoi': 'VN', 'vietnam': 'VN',
  // Middle East
  'dubai': 'AE', 'abu dhabi': 'AE', 'uae': 'AE', 'riyadh': 'SA', 'jeddah': 'SA', 'saudi': 'SA',
  'doha': 'QA', 'qatar': 'QA', 'istanbul': 'TR', 'ankara': 'TR', 'turkey': 'TR', 'türkiye': 'TR',
  'tel aviv': 'IL', 'israel': 'IL',
  // Africa
  'lagos': 'NG', 'nigeria': 'NG', 'nairobi': 'KE', 'kenya': 'KE',
  'johannesburg': 'ZA', 'cape town': 'ZA', 'south africa': 'ZA',
  'cairo': 'EG', 'egypt': 'EG', 'accra': 'GH', 'ghana': 'GH',
  'addis ababa': 'ET', 'ethiopia': 'ET', 'dar es salaam': 'TZ', 'tanzania': 'TZ',
  'kampala': 'UG', 'uganda': 'UG', 'dakar': 'SN', 'senegal': 'SN',
  'casablanca': 'MA', 'morocco': 'MA', 'tunis': 'TN', 'tunisia': 'TN',
  'africa': 'AFRICA',
  // Latin America
  'mexico city': 'MX', 'mexico': 'MX', 'bogota': 'CO', 'colombia': 'CO',
  'sao paulo': 'BR', 'rio de janeiro': 'BR', 'brazil': 'BR', 'brasil': 'BR',
  'buenos aires': 'AR', 'argentina': 'AR', 'lima': 'PE', 'peru': 'PE',
  'santiago': 'CL', 'chile': 'CL',
}

function parseGeoFromLocation(location: string | null): { tier: number | null; region: string | null; multiplier: number } {
  if (!location || location.trim().length === 0) {
    return { tier: null, region: null, multiplier: UNKNOWN_MULTIPLIER }
  }

  const normalized = location.toLowerCase().trim()

  // Try direct lookup first
  for (const [key, countryCode] of Object.entries(LOCATION_LOOKUP)) {
    if (normalized.includes(key)) {
      return classifyCountryCode(countryCode, location)
    }
  }

  // Try matching two-letter country codes at end of string (e.g., "Berlin, DE")
  const codeMatch = normalized.match(/\b([a-z]{2})\s*$/)
  if (codeMatch) {
    const code = codeMatch[1].toUpperCase()
    if (TIER_1_COUNTRIES.has(code) || TIER_2_COUNTRIES.has(code) || TIER_3_COUNTRIES.has(code)) {
      return classifyCountryCode(code, location)
    }
  }

  return { tier: null, region: null, multiplier: UNKNOWN_MULTIPLIER }
}

function classifyCountryCode(code: string, originalLocation: string): { tier: number; region: string; multiplier: number } {
  if (TIER_1_COUNTRIES.has(code)) {
    return { tier: 1, region: originalLocation, multiplier: TIER_1_MULTIPLIER }
  }
  if (TIER_2_COUNTRIES.has(code)) {
    return { tier: 2, region: originalLocation, multiplier: TIER_2_MULTIPLIER }
  }
  if (TIER_3_COUNTRIES.has(code)) {
    return { tier: 3, region: originalLocation, multiplier: TIER_3_MULTIPLIER }
  }
  // Everything else is tier 4
  return { tier: 4, region: originalLocation, multiplier: TIER_4_MULTIPLIER }
}

// ── Main Scoring Function ──

export function calculateKloutScore(
  profile: XUserProfileFull,
  tweets: XTweetMetrics[]
): ScoreBreakdown {
  const tweetsCount = tweets.length

  // Compute average tweet metrics
  let avgLikes = 0, avgRetweets = 0, avgReplies = 0, avgViews = 0
  if (tweetsCount > 0) {
    avgLikes = tweets.reduce((s, t) => s + t.likeCount, 0) / tweetsCount
    avgRetweets = tweets.reduce((s, t) => s + t.retweetCount, 0) / tweetsCount
    avgReplies = tweets.reduce((s, t) => s + t.replyCount, 0) / tweetsCount
    avgViews = tweets.reduce((s, t) => s + t.viewCount, 0) / tweetsCount
  }

  // Compute individual scores
  const reachScore = computeReachScore(profile.followersCount)
  const ratioScore = computeRatioScore(profile.followersCount, profile.followingCount)
  const engagementScore = computeEngagementScore(avgLikes, avgRetweets, avgReplies, profile.followersCount)
  const verificationScore = computeVerificationScore(profile.verifiedType)

  // Parse geo
  const geo = parseGeoFromLocation(profile.location)

  // Composite: multiplicative core + additive bonuses
  const influenceCore = reachScore * engagementScore  // 0 – 1
  const qualityScore = influenceCore + ratioScore + verificationScore  // 0 – 1.25

  // Final: quality × geo × 100, capped at 100
  const totalScore = Math.min(100, Math.round(qualityScore * geo.multiplier * 100 * 10) / 10)

  return {
    reachScore,
    ratioScore,
    engagementScore,
    verificationScore,
    geoMultiplier: geo.multiplier,
    geoTier: geo.tier,
    geoRegion: geo.region,
    qualityScore,
    totalScore,
  }
}

/** Human-readable label for a score */
export { getScoreTierTitle as getScoreLabel } from './score-tiers'

/** Human-readable label for a geo tier */
export function getGeoTierLabel(tier: number | null): string {
  switch (tier) {
    case 1: return 'Tier 1 (US/Canada)'
    case 2: return 'Tier 2 (W. Europe/AU/NZ)'
    case 3: return 'Tier 3 (E. Europe/Asia)'
    case 4: return 'Tier 4 (Africa/Other)'
    default: return 'Unknown'
  }
}
