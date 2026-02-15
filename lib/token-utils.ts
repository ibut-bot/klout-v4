/**
 * Shared helpers for formatting and parsing token amounts.
 *
 * SOL    = 9 decimals  (1 SOL  = 1_000_000_000 lamports)
 * USDC   = 6 decimals  (1 USDC = 1_000_000 base-units)
 * CUSTOM = variable decimals determined by on-chain mint
 */

export type PaymentTokenType = 'SOL' | 'USDC' | 'CUSTOM'

// ──────────────────────────────────────────────
// TokenInfo — unified token descriptor
// ──────────────────────────────────────────────

export interface TokenInfo {
  type: PaymentTokenType
  symbol: string
  decimals: number
  multiplier: number
  /** Mint address. null for native SOL. */
  mint: string | null
}

// ──────────────────────────────────────────────
// Built-in presets
// ──────────────────────────────────────────────

const KNOWN_DECIMALS: Record<'SOL' | 'USDC', number> = {
  SOL: 9,
  USDC: 6,
}

const KNOWN_MULTIPLIERS: Record<'SOL' | 'USDC', number> = {
  SOL: 1e9,
  USDC: 1e6,
}

const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export const SOL_TOKEN_INFO: TokenInfo = {
  type: 'SOL',
  symbol: 'SOL',
  decimals: 9,
  multiplier: 1e9,
  mint: null,
}

export const USDC_TOKEN_INFO: TokenInfo = {
  type: 'USDC',
  symbol: 'USDC',
  decimals: 6,
  multiplier: 1e6,
  mint: process.env.NEXT_PUBLIC_USDC_MINT || USDC_MINT_MAINNET,
}

// ──────────────────────────────────────────────
// Resolver
// ──────────────────────────────────────────────

/**
 * Build a TokenInfo from the task's paymentToken field + optional custom fields.
 * Works for SOL, USDC, and arbitrary CUSTOM SPL tokens.
 */
export function resolveTokenInfo(
  paymentToken: string,
  customMint?: string | null,
  customSymbol?: string | null,
  customDecimals?: number | null,
): TokenInfo {
  if (paymentToken === 'SOL') return SOL_TOKEN_INFO
  if (paymentToken === 'USDC') return USDC_TOKEN_INFO

  // CUSTOM
  const decimals = customDecimals ?? 9
  return {
    type: 'CUSTOM',
    symbol: customSymbol || 'TOKEN',
    decimals,
    multiplier: 10 ** decimals,
    mint: customMint || null,
  }
}

// ──────────────────────────────────────────────
// Backward-compatible scalar helpers
// (accept PaymentTokenType for SOL/USDC hot-paths)
// ──────────────────────────────────────────────

/** Number of decimal places for the token's smallest unit. */
export function tokenDecimals(token: PaymentTokenType): number {
  if (token === 'SOL' || token === 'USDC') return KNOWN_DECIMALS[token]
  return 9 // fallback; callers should prefer resolveTokenInfo for CUSTOM
}

/** Human-readable symbol string. */
export function tokenSymbol(token: PaymentTokenType): string {
  return token
}

/** The multiplier to convert 1 whole token to base units. */
export function tokenMultiplier(token: PaymentTokenType): number {
  if (token === 'SOL' || token === 'USDC') return KNOWN_MULTIPLIERS[token]
  return 1e9 // fallback
}

// ──────────────────────────────────────────────
// Formatting & Parsing (accept TokenInfo OR PaymentTokenType)
// ──────────────────────────────────────────────

function resolveMultiplier(tokenOrInfo: PaymentTokenType | TokenInfo): number {
  if (typeof tokenOrInfo === 'string') return tokenMultiplier(tokenOrInfo)
  return tokenOrInfo.multiplier
}

/**
 * Convert base-units to a human-readable string.
 * Accepts either a PaymentTokenType string or a full TokenInfo object.
 */
export function formatTokenAmount(
  baseUnits: string | number | bigint,
  tokenOrInfo: PaymentTokenType | TokenInfo,
  decimals = 4,
): string {
  const mult = resolveMultiplier(tokenOrInfo)
  const value = Number(baseUnits) / mult
  if (value === 0) return '0'
  if (value < 0.001 && decimals >= 4) return value.toPrecision(2)
  return value.toFixed(decimals)
}

/**
 * Parse a human-readable token amount into base-units.
 * Accepts either a PaymentTokenType string or a full TokenInfo object.
 */
export function parseTokenInput(
  humanReadable: string,
  tokenOrInfo: PaymentTokenType | TokenInfo,
): number {
  const mult = resolveMultiplier(tokenOrInfo)
  return Math.round(parseFloat(humanReadable) * mult)
}
