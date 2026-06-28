import { describe, it, expect } from 'vitest'
import {
  computeAnalytics,
  type AnalyticsCandle,
} from '@/lib/research/analytics'

const DAY_MS = 24 * 60 * 60 * 1000

// Build a daily series of `n` candles ending today, each close given by `fn(i)`
// where i counts from the oldest (0) to the newest (n-1).
function series(n: number, fn: (i: number) => number, volume = 1000): AnalyticsCandle[] {
  const end = Date.UTC(2024, 5, 28) // fixed anchor so tests are deterministic
  const out: AnalyticsCandle[] = []
  for (let i = 0; i < n; i++) {
    const t = end - (n - 1 - i) * DAY_MS
    out.push({ timestamp: new Date(t).toISOString(), close: fn(i), volume })
  }
  return out
}

describe('computeAnalytics', () => {
  it('returns all-null for empty input', () => {
    const a = computeAnalytics([])
    expect(a.lastClose).toBeNull()
    expect(a.sma50).toBeNull()
    expect(a.return1Y).toBeNull()
  })

  it('computes SMAs only when enough candles exist', () => {
    const flat = series(60, () => 100)
    const a = computeAnalytics(flat)
    expect(a.sma20).toBe(100)
    expect(a.sma50).toBe(100)
    expect(a.sma200).toBeNull() // need 200, only 60
    expect(a.lastClose).toBe(100)
  })

  it('computes a simple moving average over the trailing window', () => {
    // last 20 closes are 1..20 -> mean 10.5
    const a = computeAnalytics(series(20, (i) => i + 1))
    expect(a.sma20).toBeCloseTo(10.5, 6)
  })

  it('computes trailing returns from the close at-or-before the lookback date', () => {
    // 400 daily candles rising linearly from 100. close(i) = 100 + i.
    const a = computeAnalytics(series(400, (i) => 100 + i))
    const lastClose = 100 + 399
    // 30 days ago index = 399 - 30 = 369 -> close 469
    expect(a.return1M).toBeCloseTo((lastClose / (100 + 369) - 1) * 100, 6)
    // 365 days ago index = 399 - 365 = 34 -> close 134
    expect(a.return1Y).toBeCloseTo((lastClose / (100 + 34) - 1) * 100, 6)
  })

  it('returns null for a lookback that predates the series', () => {
    // Only 5 days of history -> no 1Y / 6M base available.
    const a = computeAnalytics(series(5, (i) => 100 + i))
    expect(a.return1Y).toBeNull()
    expect(a.return6M).toBeNull()
    expect(a.return1W).toBeNull() // 7 days back, only 5 days exist
  })

  it('reports max drawdown as a negative percentage', () => {
    // Climbs to a peak of 200, then falls to 150: drawdown = (150-200)/200 = -25%.
    const closes = [100, 150, 200, 175, 150, 180]
    const a = computeAnalytics(series(closes.length, (i) => closes[i] ?? 0))
    expect(a.maxDrawdown1Y).toBeLessThan(0)
    expect(a.maxDrawdown1Y).toBeCloseTo(-25, 6)
  })

  it('gives zero volatility for a perfectly flat series', () => {
    const a = computeAnalytics(series(100, () => 100))
    expect(a.annualizedVolatility).toBeCloseTo(0, 6)
    expect(a.maxDrawdown1Y).toBe(0)
  })

  it('returns null average volume when all volumes are zero (e.g. an index)', () => {
    const a = computeAnalytics(series(30, () => 100, 0))
    expect(a.avgVolume20d).toBeNull()
  })

  it('uses the previous year’s last close as the YTD base (IST year boundary)', () => {
    // Angel One stamps daily candles at IST midnight (+05:30). The YTD base must
    // be 31-Dec-2024 (200), NOT 1-Jan-2025 (210) — the bug a naive UTC boundary
    // would introduce.
    const candles: AnalyticsCandle[] = [
      { timestamp: '2024-12-30T00:00:00+05:30', close: 190, volume: 1 },
      { timestamp: '2024-12-31T00:00:00+05:30', close: 200, volume: 1 },
      { timestamp: '2025-01-01T00:00:00+05:30', close: 210, volume: 1 },
      { timestamp: '2025-01-02T00:00:00+05:30', close: 220, volume: 1 },
    ]
    const a = computeAnalytics(candles)
    expect(a.returnYTD).toBeCloseTo(10, 6) // 220 / 200 − 1
  })

  it('falls back to the first candle of the year when no prior-year close exists', () => {
    const candles: AnalyticsCandle[] = [
      { timestamp: '2025-01-01T00:00:00+05:30', close: 100, volume: 1 },
      { timestamp: '2025-02-03T00:00:00+05:30', close: 130, volume: 1 },
    ]
    const a = computeAnalytics(candles)
    expect(a.returnYTD).toBeCloseTo(30, 6) // 130 / 100 − 1
  })

  it('computes the close-based 52-week high/low', () => {
    const a = computeAnalytics(series(300, (i) => 100 + i))
    // Only the last 252 closes count toward the 52w window.
    expect(a.high52w).toBe(100 + 299)
    expect(a.low52w).toBe(100 + (300 - 252))
  })
})
