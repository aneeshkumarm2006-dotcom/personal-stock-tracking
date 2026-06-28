// Derived analytics for the research page. Angel One's API gives no fundamentals
// (P/E, market cap, etc.) and only a snapshot 52-week range, so everything here
// is COMPUTED from the daily candle history (lib/angelone/historical.ts):
// moving averages, trailing returns, annualized volatility, max drawdown, and an
// average-volume read. All pure + side-effect-free so they're trivially testable
// and safe to run on the client from already-fetched candles.

export type AnalyticsCandle = {
  timestamp: string | Date
  close: number
  volume?: number
}

export type ResearchAnalytics = {
  sma20: number | null
  sma50: number | null
  sma200: number | null
  // Trailing returns as percentages (e.g. 12.5 means +12.5%).
  return1W: number | null
  return1M: number | null
  return3M: number | null
  return6M: number | null
  return1Y: number | null
  returnYTD: number | null
  // Annualized volatility of daily log returns, as a percentage.
  annualizedVolatility: number | null
  // Worst peak-to-trough decline over the last ~year, as a (negative) percentage.
  maxDrawdown1Y: number | null
  avgVolume20d: number | null
  // Close-based 52-week range, a fallback for when the live quote omits it.
  high52w: number | null
  low52w: number | null
  // Latest candle close + its date, so callers can label "as of".
  lastClose: number | null
  asOf: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const TRADING_DAYS_PER_YEAR = 252

type Point = { t: number; close: number; volume: number }

function toPoints(candles: AnalyticsCandle[]): Point[] {
  const points: Point[] = []
  for (const c of candles) {
    const close = Number(c.close)
    if (!Number.isFinite(close)) continue
    const t = c.timestamp instanceof Date ? c.timestamp.getTime() : new Date(c.timestamp).getTime()
    if (!Number.isFinite(t)) continue
    const volume = Number(c.volume)
    points.push({ t, close, volume: Number.isFinite(volume) ? volume : 0 })
  }
  // Ensure chronological order (oldest first) regardless of input ordering.
  points.sort((a, b) => a.t - b.t)
  return points
}

function sma(points: Point[], period: number): number | null {
  if (points.length < period) return null
  let sum = 0
  for (const p of points.slice(points.length - period)) sum += p.close
  return sum / period
}

function pctReturn(now: number, then: number | null): number | null {
  if (then === null || then === 0) return null
  return (now / then - 1) * 100
}

// Close of the last candle at or before `targetMs`. Returns null if every candle
// is newer than the target (i.e. history doesn't reach back that far).
function closeAtOrBefore(points: Point[], targetMs: number): number | null {
  let found: number | null = null
  for (const p of points) {
    if (p.t <= targetMs) found = p.close
    else break
  }
  return found
}

function annualizedVolatility(points: Point[]): number | null {
  const window = points.slice(-TRADING_DAYS_PER_YEAR)
  if (window.length < 20) return null
  const logReturns: number[] = []
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]
    const curr = window[i]
    if (prev && curr && prev.close > 0 && curr.close > 0) {
      logReturns.push(Math.log(curr.close / prev.close))
    }
  }
  if (logReturns.length < 2) return null
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length
  const variance =
    logReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (logReturns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100
}

function maxDrawdown(points: Point[]): number | null {
  const window = points.slice(-TRADING_DAYS_PER_YEAR)
  const firstPoint = window[0]
  if (!firstPoint || window.length < 2) return null
  let peak = firstPoint.close
  let worst = 0
  for (const p of window) {
    if (p.close > peak) peak = p.close
    if (peak > 0) {
      const dd = (p.close - peak) / peak
      if (dd < worst) worst = dd
    }
  }
  return worst * 100
}

function avgVolume(points: Point[], period: number): number | null {
  const window = points.slice(-period)
  if (window.length === 0) return null
  let sum = 0
  for (const p of window) sum += p.volume
  // Indices report volume 0 — surface null rather than a misleading zero.
  if (sum === 0) return null
  return sum / window.length
}

export function computeAnalytics(candles: AnalyticsCandle[]): ResearchAnalytics {
  const empty: ResearchAnalytics = {
    sma20: null,
    sma50: null,
    sma200: null,
    return1W: null,
    return1M: null,
    return3M: null,
    return6M: null,
    return1Y: null,
    returnYTD: null,
    annualizedVolatility: null,
    maxDrawdown1Y: null,
    avgVolume20d: null,
    high52w: null,
    low52w: null,
    lastClose: null,
    asOf: null,
  }

  const points = toPoints(candles)
  const last = points[points.length - 1]
  if (!last) return empty

  const lastClose = last.close

  // YTD base = the previous year's last close. Candle timestamps are real instants
  // (Angel One stamps daily candles at IST midnight), so the year boundary must be
  // computed in IST: yearStartIstMs is the UTC instant of 1 Jan 00:00 IST.
  // closeAtOrBefore(boundary − 1ms) then excludes the 1-Jan candle and lands on
  // 31 Dec; we fall back to the first candle of the year for a mid-year series.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const istYear = new Date(last.t + IST_OFFSET_MS).getUTCFullYear()
  const yearStartIstMs = Date.UTC(istYear, 0, 1) - IST_OFFSET_MS
  let ytdBase = closeAtOrBefore(points, yearStartIstMs - 1)
  if (ytdBase === null) {
    const firstThisYear = points.find((p) => p.t >= yearStartIstMs)
    ytdBase = firstThisYear ? firstThisYear.close : null
  }

  const yearWindow = points.slice(-TRADING_DAYS_PER_YEAR)
  const closes52w = yearWindow.map((p) => p.close)

  return {
    sma20: sma(points, 20),
    sma50: sma(points, 50),
    sma200: sma(points, 200),
    return1W: pctReturn(lastClose, closeAtOrBefore(points, last.t - 7 * DAY_MS)),
    return1M: pctReturn(lastClose, closeAtOrBefore(points, last.t - 30 * DAY_MS)),
    return3M: pctReturn(lastClose, closeAtOrBefore(points, last.t - 91 * DAY_MS)),
    return6M: pctReturn(lastClose, closeAtOrBefore(points, last.t - 182 * DAY_MS)),
    return1Y: pctReturn(lastClose, closeAtOrBefore(points, last.t - 365 * DAY_MS)),
    returnYTD: pctReturn(lastClose, ytdBase),
    annualizedVolatility: annualizedVolatility(points),
    maxDrawdown1Y: maxDrawdown(points),
    avgVolume20d: avgVolume(points, 20),
    high52w: closes52w.length ? Math.max(...closes52w) : null,
    low52w: closes52w.length ? Math.min(...closes52w) : null,
    lastClose,
    asOf: new Date(last.t).toISOString(),
  }
}
