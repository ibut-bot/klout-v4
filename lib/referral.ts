/**
 * Referral program logic — Fibonacci-based declining fee schedule.
 *
 * The 10% platform fee is split between the referrer and the platform
 * according to the tier the referred user was in when they signed up.
 * The task performer always receives 90%.
 */

import { prisma } from './db'

// ──────────────────────────────────────────────
// Tier definitions (Fibonacci progression)
// ──────────────────────────────────────────────

export interface ReferralTier {
  tier: number
  usersInTier: number
  cumulativeStart: number // first globalPosition in this tier (1-indexed)
  cumulativeEnd: number   // last globalPosition in this tier
  referrerFeePct: number  // referrer's % of the 10% platform fee (100 = all to referrer)
  platformFeePct: number  // platform's % of the 10% platform fee
}

const TIER_USERS = [1000, 2000, 3000, 5000, 8000, 13000, 21000, 34000, 55000, 89000]
const TIER_REFERRER_PCT = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]

export const REFERRAL_TIERS: ReferralTier[] = (() => {
  let cumulative = 0
  return TIER_USERS.map((users, i) => {
    const start = cumulative + 1
    cumulative += users
    return {
      tier: i + 1,
      usersInTier: users,
      cumulativeStart: start,
      cumulativeEnd: cumulative,
      referrerFeePct: TIER_REFERRER_PCT[i],
      platformFeePct: 100 - TIER_REFERRER_PCT[i],
    }
  })
})()

export const MAX_REFERRALS = REFERRAL_TIERS[REFERRAL_TIERS.length - 1].cumulativeEnd // 231,000

// ──────────────────────────────────────────────
// Tier lookups
// ──────────────────────────────────────────────

/** Get the tier for a given global referral position (1-indexed). */
export function getTierForPosition(position: number): ReferralTier | null {
  if (position < 1 || position > MAX_REFERRALS) return null
  return REFERRAL_TIERS.find(t => position >= t.cumulativeStart && position <= t.cumulativeEnd) ?? null
}

/** Get the current tier based on total referrals so far. Returns the tier the NEXT referral will be in. */
export function getCurrentTier(totalReferrals: number): ReferralTier | null {
  const nextPosition = totalReferrals + 1
  return getTierForPosition(nextPosition)
}

/** Check if the referral program is still accepting new referrals. */
export function isReferralProgramActive(totalReferrals: number): boolean {
  return totalReferrals < MAX_REFERRALS
}

// ──────────────────────────────────────────────
// Fee calculation
// ──────────────────────────────────────────────

export interface ReferralFeeSplit {
  recipientAmount: number
  platformAmount: number
  referrerAmount: number
  referrerFeePct: number // for display — referrer's % of the 10% fee
}

/**
 * Calculate the 3-way fee split for a payment.
 * @param totalAmount  Gross payment in base units (lamports / SPL base units)
 * @param referrerFeePct  Referrer's percentage of the 10% platform fee (0-100).
 *                        0 means no referral (all platform fee goes to platform).
 * @param platformFeeBps  Platform fee in basis points (default 1000 = 10%)
 */
export function calculateReferralSplit(
  totalAmount: number,
  referrerFeePct: number = 0,
  platformFeeBps: number = 1000,
): ReferralFeeSplit {
  const totalPlatformFee = Math.floor(totalAmount * platformFeeBps / 10000)
  const recipientAmount = totalAmount - totalPlatformFee

  if (referrerFeePct <= 0 || referrerFeePct > 100) {
    return { recipientAmount, platformAmount: totalPlatformFee, referrerAmount: 0, referrerFeePct: 0 }
  }

  const referrerAmount = Math.floor(totalPlatformFee * referrerFeePct / 100)
  const platformAmount = totalPlatformFee - referrerAmount

  return { recipientAmount, platformAmount, referrerAmount, referrerFeePct }
}

// ──────────────────────────────────────────────
// Referral code helpers
// ──────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1 for readability

/** Generate a unique referral code like "KL-A3B7X2". */
export function generateReferralCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return `KL-${code}`
}

// ──────────────────────────────────────────────
// Database helpers
// ──────────────────────────────────────────────

/** Get total number of completed referrals (referred user has a Klout score). */
export async function getTotalReferralCount(): Promise<number> {
  return prisma.referral.count({ where: { completedAt: { not: null } } })
}

/** Get referral info for a task performer (by userId). Returns null if not referred or not completed. */
export async function getReferralInfoForUser(userId: string): Promise<{
  referralId: string
  referrerId: string
  referrerWallet: string
  referrerFeePct: number
  tierNumber: number
} | null> {
  const referral = await prisma.referral.findUnique({
    where: { referredUserId: userId },
    include: { referrer: { select: { walletAddress: true } } },
  })

  if (!referral || !referral.completedAt) return null

  return {
    referralId: referral.id,
    referrerId: referral.referrerId,
    referrerWallet: referral.referrer.walletAddress,
    referrerFeePct: referral.referrerFeePct,
    tierNumber: referral.tierNumber,
  }
}

/** Record a referral earning after a payment is made. */
export async function recordReferralEarning(params: {
  referralId: string
  referrerId: string
  referredUserId: string
  taskId?: string
  submissionId?: string
  bidId?: string
  tokenType: 'SOL' | 'USDC' | 'CUSTOM'
  tokenMint?: string
  totalAmount: bigint
  referrerAmount: bigint
  platformAmount: bigint
  txSignature?: string
}): Promise<void> {
  await prisma.referralEarning.create({ data: params })
}

/** Get the current tier info for the progress bar. */
export async function getReferralProgramStatus(): Promise<{
  totalReferrals: number
  currentTier: ReferralTier | null
  usersInCurrentTier: number
  remainingInCurrentTier: number
  isActive: boolean
  tiers: ReferralTier[]
}> {
  const totalReferrals = await getTotalReferralCount()
  const currentTier = getCurrentTier(totalReferrals)
  
  let usersInCurrentTier = 0
  let remainingInCurrentTier = 0
  
  if (currentTier) {
    usersInCurrentTier = totalReferrals - currentTier.cumulativeStart + 1
    if (usersInCurrentTier < 0) usersInCurrentTier = 0
    remainingInCurrentTier = currentTier.cumulativeEnd - totalReferrals
  }

  return {
    totalReferrals,
    currentTier,
    usersInCurrentTier,
    remainingInCurrentTier,
    isActive: isReferralProgramActive(totalReferrals),
    tiers: REFERRAL_TIERS,
  }
}
