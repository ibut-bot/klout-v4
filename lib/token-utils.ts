/**
 * Shared helpers for formatting and parsing token amounts (SOL / USDC).
 *
 * SOL  = 9 decimals  (1 SOL  = 1_000_000_000 lamports)
 * USDC = 6 decimals  (1 USDC = 1_000_000 base-units)
 */

export type PaymentTokenType = 'SOL' | 'USDC'

const DECIMALS: Record<PaymentTokenType, number> = {
  SOL: 9,
  USDC: 6,
}

const MULTIPLIERS: Record<PaymentTokenType, number> = {
  SOL: 1e9,
  USDC: 1e6,
}

/** Number of decimal places for the token's smallest unit. */
export function tokenDecimals(token: PaymentTokenType): number {
  return DECIMALS[token]
}

/** Human-readable symbol string. */
export function tokenSymbol(token: PaymentTokenType): string {
  return token // "SOL" or "USDC"
}

/** The multiplier to convert 1 whole token to base units. */
export function tokenMultiplier(token: PaymentTokenType): number {
  return MULTIPLIERS[token]
}

/**
 * Convert base-units (lamports / USDC micro-units) to a human-readable string.
 * e.g. formatTokenAmount(1_500_000_000, 'SOL') => "1.5000"
 *      formatTokenAmount(1_500_000, 'USDC')    => "1.5000"
 */
export function formatTokenAmount(
  baseUnits: string | number | bigint,
  token: PaymentTokenType,
  decimals = 4,
): string {
  const value = Number(baseUnits) / MULTIPLIERS[token]
  if (value === 0) return '0'
  if (value < 0.001 && decimals >= 4) return value.toPrecision(2)
  return value.toFixed(decimals)
}

/**
 * Parse a human-readable token amount into base-units.
 * e.g. parseTokenInput("1.5", "SOL")  => 1_500_000_000
 *      parseTokenInput("1.5", "USDC") => 1_500_000
 */
export function parseTokenInput(humanReadable: string, token: PaymentTokenType): number {
  return Math.round(parseFloat(humanReadable) * MULTIPLIERS[token])
}
