const BASE_FEE_LAMPORTS = Number(process.env.NEXT_PUBLIC_X_API_FEE_LAMPORTS || 500000)

export function getKloutFeeMultiplier(score: number): number {
  if (score >= 1500) return 1
  if (score >= 1250) return 1.5
  if (score >= 1000) return 2
  if (score >= 750) return 3
  if (score >= 500) return 4
  if (score >= 250) return 6
  if (score >= 100) return 8
  return 10
}

export function getRepeatSubmissionMultiplier(priorCount: number): number {
  return Math.pow(1.2, priorCount)
}

export function getKloutAdjustedFee(score: number, priorSubmissionCount = 0): number {
  return Math.floor(
    BASE_FEE_LAMPORTS * getKloutFeeMultiplier(score) * getRepeatSubmissionMultiplier(priorSubmissionCount)
  )
}
