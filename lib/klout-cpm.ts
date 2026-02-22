import { SCORE_TIERS } from './score-tiers'

const TIER_MULTIPLIERS: Record<string, number> = {
  'NPC Energy': 0.10,
  'Background Character': 0.25,
  'Side Character With Lines': 0.45,
  'Main Character Warming Up': 0.65,
  'The Closer': 0.80,
  'Dangerously Persuasive': 0.90,
  'Reality Distortion Field': 0.95,
  'World Bender': 1.00,
}

export function getKloutCpmMultiplier(score: number): number {
  const tier = SCORE_TIERS.find(t => score >= t.min && score <= t.max)
  if (!tier) return 0.10
  return TIER_MULTIPLIERS[tier.title] ?? 0.10
}
