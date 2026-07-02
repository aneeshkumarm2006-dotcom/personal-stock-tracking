// Shared alert-condition types. Client-safe (no runtime/server deps) so both the
// API routes and the React alert components can import them.
//
// Alerts started life as a single price-cross ({ targetPrice, direction }). They
// are now a discriminated union keyed by `type`: `price` is the original (kept
// flat for backward compatibility) and everything else carries its parameters in
// a `config` bag. See lib/alerts/conditions.ts for how each type is evaluated and
// lib/alerts/describe.ts for how each is phrased.

export type AlertDirection = 'below' | 'above'
export type AlertStatus = 'armed' | 'triggered' | 'snoozed' | 'disabled'

// Every supported condition. `price` is the Normal alert; the rest are Advanced.
export type ConditionType =
  | 'price' // ltp crosses a fixed target (uses top-level targetPrice + direction)
  | 'pct_change' // intraday day-change % crosses ±threshold (uses direction)
  | 'volume' // today's cumulative volume ≥ multiple × 20-day average
  | 'week52' // ltp breaks the 52-week high / low
  | 'circuit' // ltp reaches the day's upper / lower circuit
  | 'sma_cross' // ltp crosses an N-period SMA (uses direction)
  | 'ema_cross' // ltp crosses an N-period EMA (uses direction)
  | 'rsi' // RSI(14) reaches an overbought / oversold band
  | 'macd_cross' // MACD line crosses its signal line (bullish / bearish)
  | 'rating_flip' // TradingView-style technical rating flips bucket

export const CONDITION_TYPES: readonly ConditionType[] = [
  'price',
  'pct_change',
  'volume',
  'week52',
  'circuit',
  'sma_cross',
  'ema_cross',
  'rsi',
  'macd_cross',
  'rating_flip',
]

// Condition types whose evaluation needs a per-token IndicatorSnapshot (daily
// candles). `week52` is NOT here: it reads the live quote's 52-week fields, with
// the indicator's close-based range only as an optional fallback. Everything
// outside this set is purely quote-derived and fires from the snapshot alone.
export const INDICATOR_ALERT_TYPES: readonly ConditionType[] = [
  'volume',
  'sma_cross',
  'ema_cross',
  'rsi',
  'macd_cross',
  'rating_flip',
]

export type RatingTimeframe = '1D' | '1W' | '1M'
export type RatingBucket = 'buy' | 'sell' | 'neutral'

// The per-type parameter bag persisted in the alert's `config` (Mixed on the
// model). Every field is optional; which ones matter depends on `type`. The
// cross direction for price/pct_change/sma_cross/ema_cross lives in the alert's
// top-level `direction`, not here.
export type AlertConfig = {
  // pct_change
  thresholdPct?: number
  // volume
  mode?: 'spike'
  multiple?: number
  // week52
  edge?: 'high' | 'low'
  marginPct?: number
  // circuit
  band?: 'upper' | 'lower' | 'either'
  // sma_cross / ema_cross
  period?: number
  // rsi
  rsiBand?: 'overbought' | 'oversold'
  threshold?: number
  // macd_cross
  macdDirection?: 'bullish' | 'bearish'
  // rating_flip
  timeframe?: RatingTimeframe
  to?: RatingBucket | 'any'
}
