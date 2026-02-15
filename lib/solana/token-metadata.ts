/**
 * Fetch on-chain metadata for any SPL token mint.
 *
 * Strategy:
 * 1. Call getMint() to reliably read decimals from the on-chain mint account.
 * 2. Look up symbol / name / logoUri from the Jupiter strict token list.
 * 3. Fallback: truncated mint address as symbol if not found.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { getMint, type Mint } from '@solana/spl-token'

export interface SplTokenMetadata {
  mint: string
  symbol: string
  name: string
  decimals: number
  logoUri: string | null
}

interface TokenListInfo { symbol: string; name: string; logoURI?: string }

// Per-mint cache so we don't re-fetch the same token
const tokenInfoCache = new Map<string, TokenListInfo>()

/** Look up token symbol / name / icon via DexScreener (free, no API key). */
async function fetchDexScreenerToken(mintAddress: string): Promise<TokenListInfo | null> {
  if (tokenInfoCache.has(mintAddress)) return tokenInfoCache.get(mintAddress)!
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mintAddress}`)
    if (!res.ok) return null
    const data = await res.json()
    const pair = Array.isArray(data) && data.length > 0 ? data[0] : null
    if (!pair?.baseToken) return null
    const info: TokenListInfo = {
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      logoURI: pair.info?.imageUrl || undefined,
    }
    tokenInfoCache.set(mintAddress, info)
    return info
  } catch { /* ignore */ }
  return null
}

/**
 * Fetch metadata for an SPL token from on-chain + Jupiter token list.
 * Throws if the mint address is invalid or the account doesn't exist.
 */
export async function fetchTokenMetadata(
  connection: Connection,
  mintAddress: string,
): Promise<SplTokenMetadata> {
  // Validate address format
  let mintPk: PublicKey
  try {
    mintPk = new PublicKey(mintAddress)
  } catch {
    throw new Error('Invalid mint address')
  }

  // Fetch on-chain mint info (decimals)
  let mintInfo: Mint
  try {
    mintInfo = await getMint(connection, mintPk)
  } catch {
    throw new Error('Mint account not found on-chain. Ensure this is a valid SPL token mint.')
  }

  // Look up symbol/name/icon via DexScreener
  const tokenListInfo = await fetchDexScreenerToken(mintAddress)

  const symbol = tokenListInfo?.symbol || mintAddress.slice(0, 4) + '...'
  const name = tokenListInfo?.name || `Unknown Token (${mintAddress.slice(0, 8)}...)`
  const logoUri = tokenListInfo?.logoURI || null

  return {
    mint: mintAddress,
    symbol,
    name,
    decimals: mintInfo.decimals,
    logoUri,
  }
}
