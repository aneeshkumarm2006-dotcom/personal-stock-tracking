// Pure client-safe metadata for chart patterns — human labels for the detector
// bucket keys and tier tags, plus overlay/geometry helpers. NO server imports, so
// both server components and 'use client' children can pull from here.
//
// Keys mirror the Python detector module names (engine/patterns/detectors/*), which
// ARE the bucket/strategy keys (§11). Tier-3 vetoes never publish a signal or a
// bucket, but their labels are kept for completeness.

export const PATTERN_LABELS: Record<string, string> = {
  // Tier 2 — expected-strong
  cup_handle: 'Cup & handle',
  double_bottom_ee: 'Double bottom',
  inverse_hs: 'Inverse H&S',
  high_tight_flag: 'High tight flag',
  ascending_triangle: 'Ascending triangle',
  three_weeks_tight: '3 weeks tight',
  // Tier 4 — expected-weak (exist to be falsified)
  pennant: 'Pennant',
  symmetrical_triangle: 'Symmetrical triangle',
  falling_wedge: 'Falling wedge',
  rising_wedge: 'Rising wedge',
  v_bottom: 'V-bottom',
  bull_flag: 'Bull flag',
  // Tier 3 — vetoes (no paper bucket)
  top_breakdown_veto: 'Top breakdown veto',
  descending_triangle_veto: 'Descending triangle veto',
  distribution_veto: 'Distribution veto',
}

export function patternLabel(key: string | null | undefined): string {
  if (!key) return '—'
  return PATTERN_LABELS[key] ?? key
}

export const TIER_LABELS: Record<string, string> = {
  tier2: 'Tier 2',
  tier3: 'Tier 3',
  tier4: 'Tier 4',
}

export function tierLabel(tier: string | null | undefined): string | null {
  if (!tier) return null
  return TIER_LABELS[tier] ?? tier
}

// Tier 2 = expected-strong, Tier 4 = expected-weak (falsification candidates).
export function tierTone(tier: string | null | undefined): string {
  switch (tier) {
    case 'tier2':
      return 'bg-primary/10 text-primary'
    case 'tier4':
      return 'bg-muted text-muted-foreground'
    case 'tier3':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-500'
    default:
      return 'bg-secondary text-secondary-foreground'
  }
}

// Friendly labels for the per-pattern quality sub-score components (extras.quality
// .components) and geometry keys on the signal-detail page. Unknown keys fall
// through to their raw name, so new detectors still render.
export const QUALITY_COMPONENT_LABELS: Record<string, string> = {
  rim_symmetry: 'Rim symmetry',
  u_depth: 'U-depth',
  handle_drift: 'Handle drift',
  vdu: 'Volume dry-up',
  breakout_vol: 'Breakout volume',
  flat_top: 'Flat top',
  touches: 'Trendline touches',
  rising_support: 'Rising support',
  symmetry: 'Symmetry',
  depth: 'Depth',
  neckline_quality: 'Neckline quality',
  pole_strength: 'Pole strength',
  tightness: 'Tightness',
  volume: 'Volume',
}

export function qualityComponentLabel(key: string): string {
  return QUALITY_COMPONENT_LABELS[key] ?? key
}
