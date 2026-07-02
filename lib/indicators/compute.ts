import type { CandleData } from '@/lib/angelone/historical'
import { computeAnalytics } from '@/lib/research/analytics'
import {
  computeTechnicalRating,
  resampleCandles,
  type RatingCandle,
  type Signal,
  type Timeframe,
} from '@/lib/research/technicalRating'
import {
  INDICATOR_MA_PERIODS,
  type IndicatorSnapshotData,
} from '@/lib/indicators/types'
import type { RatingBucket } from '@/lib/alerts/types'

// Pure indicator math computed from daily candles. SMA/EMA/RSI/MACD are standard
// formulas; the TradingView-style rating and the 52-week/volume reads delegate to
// the existing, tested research engines. Side-effect-free so it's unit-testable.

function smaLast(closes: number[], period: number): number | null {
  if (closes.length < period) return null
  let sum = 0
  for (let i = closes.length - period; i < closes.length; i++) sum += closes[i]!
  return sum / period
}

function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return []
  const k = 2 / (period + 1)
  const out: number[] = [values[0]!]
  for (let i = 1; i < values.length; i++) {
    out.push(values[i]! * k + out[i - 1]! * (1 - k))
  }
  return out
}

function emaLast(values: number[], period: number): number | null {
  if (values.length < period) return null
  return emaSeries(values, period).at(-1) ?? null
}

// Wilder's RSI over the given period (default 14).
function rsiLast(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!
    if (change >= 0) avgGain += change
    else avgLoss -= change
  }
  avgGain /= period
  avgLoss /= period
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

type MacdPoint = {
  macd: number | null
  signal: number | null
  prevMacd: number | null
  prevSignal: number | null
}

// MACD(12,26,9): line = EMA12 − EMA26, signal = 9-EMA of the line. Keeps the
// latest and previous session's line/signal so a cross (not just a level) can be
// detected downstream.
function macdValues(closes: number[]): MacdPoint {
  const empty: MacdPoint = {
    macd: null,
    signal: null,
    prevMacd: null,
    prevSignal: null,
  }
  if (closes.length < 26 + 9) return empty
  const ema12 = emaSeries(closes, 12)
  const ema26 = emaSeries(closes, 26)
  const macdLine: number[] = []
  for (let i = 0; i < closes.length; i++) macdLine.push(ema12[i]! - ema26[i]!)
  // Drop the leadin where EMA26 is still settling, then smooth into the signal.
  const settled = macdLine.slice(25)
  const signal = emaSeries(settled, 9)
  return {
    macd: settled.at(-1) ?? null,
    signal: signal.at(-1) ?? null,
    prevMacd: settled.at(-2) ?? null,
    prevSignal: signal.at(-2) ?? null,
  }
}

function ratingBucket(signal: Signal | null): RatingBucket | undefined {
  if (!signal) return undefined
  if (signal === 'Strong Buy' || signal === 'Buy') return 'buy'
  if (signal === 'Strong Sell' || signal === 'Sell') return 'sell'
  return 'neutral'
}

export function computeIndicators(
  token: string,
  exchange: string | undefined,
  candles: CandleData[],
): IndicatorSnapshotData {
  const sorted = [...candles].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )
  const closes = sorted.map((c) => c.close).filter((c) => Number.isFinite(c))
  const analytics = computeAnalytics(sorted)

  const sma: Record<string, number> = {}
  const ema: Record<string, number> = {}
  for (const period of INDICATOR_MA_PERIODS) {
    const s = smaLast(closes, period)
    if (s !== null) sma[String(period)] = s
    const e = emaLast(closes, period)
    if (e !== null) ema[String(period)] = e
  }

  const macd = macdValues(closes)

  const ratingCandles = sorted as unknown as RatingCandle[]
  const rating: IndicatorSnapshotData['rating'] = {}
  const prevRating: IndicatorSnapshotData['prevRating'] = {}
  for (const tf of ['1D', '1W', '1M'] as Timeframe[]) {
    const tfc = resampleCandles(ratingCandles, tf)
    if (tfc.length === 0) continue
    const cur = ratingBucket(computeTechnicalRating(tfc).summary.signal)
    if (cur) rating[tf] = cur
    if (tfc.length >= 2) {
      const prev = ratingBucket(
        computeTechnicalRating(tfc.slice(0, -1)).summary.signal,
      )
      if (prev) prevRating[tf] = prev
    }
  }

  return {
    token,
    exchange,
    asOfCandle: sorted.at(-1)?.timestamp.toISOString() ?? null,
    sma,
    ema,
    rsi14: rsiLast(closes, 14),
    macd: macd.macd,
    macdSignal: macd.signal,
    prevMacd: macd.prevMacd,
    prevSignal: macd.prevSignal,
    rating,
    prevRating,
    high52w: analytics.high52w,
    low52w: analytics.low52w,
    avgVolume20d: analytics.avgVolume20d,
  }
}
