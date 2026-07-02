import type { RatingBucket, RatingTimeframe } from '@/lib/alerts/types'

// The daily-cadence indicator values for one instrument, computed from ~2y of
// daily candles once per session and cached in the IndicatorSnapshot collection.
// Alert evaluation compares the live quote against these each minute without
// re-fetching candles (see lib/prices/refresh.ts + lib/alerts/conditions.ts).
//
// `sma`/`ema` are keyed by period-as-string ('5','20','50','200', …). MACD keeps
// both the latest and previous session's line/signal so a *cross* (not just a
// level) can be detected. `rating`/`prevRating` hold the TradingView-style bucket
// per timeframe so a rating *flip* can be detected.
export type IndicatorSnapshotData = {
  token: string
  exchange?: string
  // ISO date of the last daily candle used — the staleness key (recompute once a
  // new session closes).
  asOfCandle: string | null
  sma: Record<string, number>
  ema: Record<string, number>
  rsi14: number | null
  macd: number | null
  macdSignal: number | null
  prevMacd: number | null
  prevSignal: number | null
  rating: Partial<Record<RatingTimeframe, RatingBucket>>
  prevRating: Partial<Record<RatingTimeframe, RatingBucket>>
  high52w: number | null
  low52w: number | null
  avgVolume20d: number | null
}

// The SMA/EMA periods we precompute for cross alerts. Includes 5 (the "price
// below 5 SMA" case) plus the common longer windows.
export const INDICATOR_MA_PERIODS = [5, 10, 20, 50, 100, 200] as const
