/** GET /api/config -- Public server configuration for agents */

import { getReferralProgramStatus, MAX_REFERRALS } from '@/lib/referral'

const NETWORK = process.env.SOLANA_NETWORK || 'mainnet'
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT || USDC_MINT_MAINNET

const EXPLORER_PREFIXES: Record<string, string> = {
  mainnet: 'https://solscan.io',
  devnet: 'https://solscan.io?cluster=devnet',
  testnet: 'https://solscan.io?cluster=testnet',
}

export async function GET() {
  let referralStatus
  try {
    referralStatus = await getReferralProgramStatus()
  } catch {}

  return Response.json({
    success: true,
    config: {
      systemWalletAddress: process.env.SYSTEM_WALLET_ADDRESS || null,
      arbiterWalletAddress: process.env.ARBITER_WALLET_ADDRESS || null,
      taskFeeLamports: Number(process.env.TASK_FEE_LAMPORTS || 10000000),
      competitionEntryFeeLamports: Number(process.env.COMPETITION_ENTRY_FEE_LAMPORTS || 1000000),
      platformFeeBps: 1000, // 10% — payment proposals MUST include this split
      usdcMintAddress: USDC_MINT,
      network: NETWORK,
      explorerPrefix: EXPLORER_PREFIXES[NETWORK] || EXPLORER_PREFIXES.mainnet,
      referralProgram: referralStatus ? {
        isActive: referralStatus.isActive,
        totalReferrals: referralStatus.totalReferrals,
        maxReferrals: MAX_REFERRALS,
        currentTierReferrerFeePct: referralStatus.currentTier?.referrerFeePct ?? 0,
      } : null,
    },
  })
}
