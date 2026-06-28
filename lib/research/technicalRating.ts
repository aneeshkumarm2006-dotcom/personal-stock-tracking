// A from-scratch clone of TradingView's "Technical Ratings" engine (the Buy/Sell/
// Neutral "Indicators summary" gauge on a symbol's Technicals tab), computed
// purely from OHLCV candles. Angel One gives us the candles; everything here is
// COMPUTED, pure, and side-effect-free so it's trivially unit-tested and runs on
// the client from already-fetched history.
//
// The exact rules below were reverse-engineered and cross-verified against
// TradingView's Help Center "Technical Ratings" article and the official Pine
// `TechnicalRating` library (see scratchpad/tv-spec.json for the full derivation).
// Where sources disagreed, the Help Center (which describes the *displayed* gauge)
// was treated as canonical; those spots are flagged inline with "spec:".
//
// 26 indicators in two groups:
//   - Moving Averages (15): SMA/EMA at 10/20/30/50/100/200, VWMA 20, Hull MA 9,
//     Ichimoku Base Line. Each votes by price-vs-line, except Ichimoku.
//   - Oscillators (11): RSI, Stochastic, CCI, ADX, Awesome, Momentum, MACD,
//     Stochastic RSI, Williams %R, Bull Bear Power, Ultimate Oscillator.
//
// Each indicator votes Buy(+1) / Neutral(0) / Sell(-1). An indicator without
// enough history (or hitting a divide-by-zero) is EXCLUDED from its group's
// average — it is NOT counted as a Neutral 0.

export type RatingCandle = {
  timestamp: string | Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Vote = 'buy' | 'sell' | 'neutral'
export type Signal = 'Strong Sell' | 'Sell' | 'Neutral' | 'Buy' | 'Strong Buy'

export type IndicatorResult = {
  name: string
  value: number | null // the indicator's latest value, for display; null = n/a
  vote: Vote | null // null = excluded (insufficient data / divide-by-zero)
}

export type GroupRating = {
  // Mean of member votes in [-1, 1] (excluded members don't count); null if none.
  score: number | null
  signal: Signal | null
  buy: number
  neutral: number
  sell: number
  indicators: IndicatorResult[]
}

export type TechnicalRating = {
  movingAverages: GroupRating
  oscillators: GroupRating
  summary: {
    score: number | null
    signal: Signal | null
    buy: number
    neutral: number
    sell: number
  }
  lastClose: number | null
  asOf: string | null
  candleCount: number
}

// ---- series primitives -----------------------------------------------------
// All operate on (number | null)[] where null marks "undefined here" (n/a).
// noUncheckedIndexedAccess is on, so we read through get() which folds the
// out-of-range `undefined` into null.

type Series = (number | null)[]

function get(s: Series, i: number): number | null {
  if (i < 0 || i >= s.length) return null
  const v = s[i]
  return v === undefined ? null : v
}

// Value at `fromEnd` bars back from the last (0 = last, 1 = previous, ...).
function at(s: Series, fromEnd: number): number | null {
  return get(s, s.length - 1 - fromEnd)
}

// Windowed simple moving average; a window containing any null yields null.
function smaSeries(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (period <= 0) return out
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0
    let ok = true
    for (let k = 0; k < period; k++) {
      const v = get(values, i - k)
      if (v === null) {
        ok = false
        break
      }
      sum += v
    }
    if (ok) out[i] = sum / period
  }
  return out
}

// Wilder's RMA (Pine ta.rma): SMA-seeded — the first output is the SMA of the
// first `period` values, emitted at index period-1, then smoothed with α=1/period.
// Used by RSI and ADX. RESETS on any null gap so a stray divide-by-zero deep in
// history doesn't poison the tail.
function rmaSeries(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (period <= 0) return out
  const alpha = 1 / period
  let prev: number | null = null
  let seed: number[] = []
  for (let i = 0; i < values.length; i++) {
    const v = get(values, i)
    if (v === null || !Number.isFinite(v)) {
      prev = null
      seed = []
      continue
    }
    if (prev === null) {
      seed.push(v)
      if (seed.length === period) {
        let s = 0
        for (const x of seed) s += x
        const m = s / period
        out[i] = m
        prev = m
      }
    } else {
      const s: number = alpha * v + (1 - alpha) * prev
      out[i] = s
      prev = s
    }
  }
  return out
}

// EMA (Pine ta.ema): seeded with the FIRST finite source value and run from that
// bar (`na(ema[1]) ? src : α·src + (1−α)·ema[1]`, α=2/(period+1)) — NOT SMA-seeded
// like RMA. We expose a value only once `period` finite bars exist, so a short
// series excludes EMA(N) like SMA(N); every value we DO emit equals ta.ema exactly
// because the seed has been smoothing since the first bar. RESETS on a null gap so
// a late-starting input (e.g. MACD's signal over a series that is null until both
// EMAs exist) seeds at its first finite value, matching Pine's na handling.
function emaSeries(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (period <= 0) return out
  const alpha = 2 / (period + 1)
  let prev: number | null = null
  let count = 0
  for (let i = 0; i < values.length; i++) {
    const v = get(values, i)
    if (v === null || !Number.isFinite(v)) {
      prev = null
      count = 0
      continue
    }
    count++
    prev = prev === null ? v : alpha * v + (1 - alpha) * prev
    if (count >= period) out[i] = prev
  }
  return out
}

// Linearly-weighted moving average (weights 1..period, newest heaviest).
function wmaSeries(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (period <= 0) return out
  const denom = (period * (period + 1)) / 2
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0
    let ok = true
    for (let k = 0; k < period; k++) {
      const v = get(values, i - k)
      if (v === null) {
        ok = false
        break
      }
      acc += v * (period - k)
    }
    if (ok) out[i] = acc / denom
  }
  return out
}

function highestSeries(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    let m = -Infinity
    let ok = true
    for (let k = 0; k < period; k++) {
      const v = get(values, i - k)
      if (v === null) {
        ok = false
        break
      }
      if (v > m) m = v
    }
    if (ok) out[i] = m
  }
  return out
}

function lowestSeries(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    let m = Infinity
    let ok = true
    for (let k = 0; k < period; k++) {
      const v = get(values, i - k)
      if (v === null) {
        ok = false
        break
      }
      if (v < m) m = v
    }
    if (ok) out[i] = m
  }
  return out
}

// ---- indicator value series ------------------------------------------------

type Ctx = {
  open: number[]
  high: Series
  low: Series
  close: number[]
  closeS: Series
  volume: Series
}

function vwmaSeries(ctx: Ctx, period: number): Series {
  const cv: Series = ctx.close.map((c, i) => {
    const v = get(ctx.volume, i)
    return v === null ? null : c * v
  })
  const smaCV = smaSeries(cv, period)
  const smaV = smaSeries(ctx.volume, period)
  return ctx.close.map((_, i) => {
    const a = get(smaCV, i)
    const b = get(smaV, i)
    if (a === null || b === null || b === 0) return null
    return a / b
  })
}

function hullSeries(values: Series, period: number): Series {
  const half = Math.floor(period / 2) // Pine integer division floors length/2
  const sqrt = Math.round(Math.sqrt(period)) // Pine ta.hma rounds sqrt(length)
  const wmaHalf = wmaSeries(values, half)
  const wmaFull = wmaSeries(values, period)
  const diff: Series = values.map((_, i) => {
    const a = get(wmaHalf, i)
    const b = get(wmaFull, i)
    if (a === null || b === null) return null
    return 2 * a - b
  })
  return wmaSeries(diff, sqrt)
}

function donchian(high: Series, low: Series, len: number): Series {
  const hh = highestSeries(high, len)
  const ll = lowestSeries(low, len)
  return high.map((_, i) => {
    const h = get(hh, i)
    const l = get(ll, i)
    if (h === null || l === null) return null
    return (h + l) / 2
  })
}

function rsiSeries(close: number[], period: number): Series {
  const n = close.length
  const out: Series = new Array(n).fill(null)
  if (n < 2) return out
  // change series lives at indices 1..n-1 (bar 0 has no prior).
  const gains: Series = []
  const losses: Series = []
  for (let i = 1; i < n; i++) {
    const prev = close[i - 1]
    const cur = close[i]
    if (prev === undefined || cur === undefined) {
      gains.push(null)
      losses.push(null)
      continue
    }
    const ch = cur - prev
    gains.push(Math.max(ch, 0))
    losses.push(Math.max(-ch, 0))
  }
  const rg = rmaSeries(gains, period)
  const rl = rmaSeries(losses, period)
  for (let j = 0; j < gains.length; j++) {
    const g = get(rg, j)
    const l = get(rl, j)
    if (g === null || l === null) continue
    // Wilder: loss 0 → RS infinite → RSI 100. (Flat series never trips the
    // <30/>70 thresholds anyway, so it stays Neutral.)
    out[j + 1] = l === 0 ? 100 : 100 - 100 / (1 + g / l)
  }
  return out
}

function stochKD(
  high: Series,
  low: Series,
  source: Series,
  kLen: number,
  kSmooth: number,
  dSmooth: number,
): { k: Series; d: Series } {
  const hh = highestSeries(high, kLen)
  const ll = lowestSeries(low, kLen)
  const rawK: Series = source.map((_, i) => {
    const c = get(source, i)
    const h = get(hh, i)
    const l = get(ll, i)
    if (c === null || h === null || l === null) return null
    const range = h - l
    if (range === 0) return null
    return (100 * (c - l)) / range
  })
  const k = smaSeries(rawK, kSmooth)
  const d = smaSeries(k, dSmooth)
  return { k, d }
}

function cciSeries(ctx: Ctx, period: number): Series {
  const tp: Series = ctx.close.map((c, i) => {
    const h = get(ctx.high, i)
    const l = get(ctx.low, i)
    if (h === null || l === null) return null
    return (h + l + c) / 3
  })
  const smaTp = smaSeries(tp, period)
  return tp.map((_, i) => {
    const m = get(smaTp, i)
    const t = get(tp, i)
    if (m === null || t === null) return null
    let dev = 0
    let ok = true
    for (let k = 0; k < period; k++) {
      const v = get(tp, i - k)
      if (v === null) {
        ok = false
        break
      }
      dev += Math.abs(v - m)
    }
    if (!ok) return null
    dev /= period
    if (dev === 0) return null
    return (t - m) / (0.015 * dev)
  })
}

function adxSeries(
  ctx: Ctx,
  diLen: number,
  adxLen: number,
): { adx: Series; plusDI: Series; minusDI: Series } {
  const n = ctx.close.length
  const adx: Series = new Array(n).fill(null)
  const plusDI: Series = new Array(n).fill(null)
  const minusDI: Series = new Array(n).fill(null)
  if (n < 2) return { adx, plusDI, minusDI }

  // Directional movement + true range live at indices 1..n-1.
  const tr: Series = []
  const pDM: Series = []
  const mDM: Series = []
  for (let i = 1; i < n; i++) {
    const h = get(ctx.high, i)
    const hPrev = get(ctx.high, i - 1)
    const l = get(ctx.low, i)
    const lPrev = get(ctx.low, i - 1)
    const cPrev = ctx.close[i - 1]
    if (h === null || hPrev === null || l === null || lPrev === null || cPrev === undefined) {
      tr.push(null)
      pDM.push(null)
      mDM.push(null)
      continue
    }
    const up = h - hPrev
    const down = lPrev - l
    pDM.push(up > down && up > 0 ? up : 0)
    mDM.push(down > up && down > 0 ? down : 0)
    tr.push(Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev)))
  }

  const rTR = rmaSeries(tr, diLen)
  const rP = rmaSeries(pDM, diLen)
  const rM = rmaSeries(mDM, diLen)

  const dx: Series = tr.map((_, j) => {
    const t = get(rTR, j)
    const p = get(rP, j)
    const m = get(rM, j)
    if (t === null || p === null || m === null || t === 0) return null
    const plus = (100 * p) / t
    const minus = (100 * m) / t
    const sum = plus + minus
    if (sum === 0) return null
    return (100 * Math.abs(plus - minus)) / sum
  })
  const rADX = rmaSeries(dx, adxLen)

  for (let j = 0; j < tr.length; j++) {
    const t = get(rTR, j)
    const p = get(rP, j)
    const m = get(rM, j)
    if (t !== null && p !== null && m !== null && t !== 0) {
      plusDI[j + 1] = (100 * p) / t
      minusDI[j + 1] = (100 * m) / t
    }
    const a = get(rADX, j)
    if (a !== null) adx[j + 1] = a
  }
  return { adx, plusDI, minusDI }
}

function awesomeSeries(ctx: Ctx): Series {
  const median: Series = ctx.close.map((_, i) => {
    const h = get(ctx.high, i)
    const l = get(ctx.low, i)
    if (h === null || l === null) return null
    return (h + l) / 2
  })
  const fast = smaSeries(median, 5)
  const slow = smaSeries(median, 34)
  return median.map((_, i) => {
    const f = get(fast, i)
    const s = get(slow, i)
    if (f === null || s === null) return null
    return f - s
  })
}

function momentumSeries(close: number[], period: number): Series {
  return close.map((c, i) => {
    const prev = close[i - period]
    if (prev === undefined) return null
    return c - prev
  })
}

function macdSeries(ctx: Ctx): { macd: Series; signal: Series } {
  const fast = emaSeries(ctx.closeS, 12)
  const slow = emaSeries(ctx.closeS, 26)
  const macd: Series = ctx.close.map((_, i) => {
    const f = get(fast, i)
    const s = get(slow, i)
    if (f === null || s === null) return null
    return f - s
  })
  const signal = emaSeries(macd, 9)
  return { macd, signal }
}

function ultimateSeries(ctx: Ctx): Series {
  const n = ctx.close.length
  const bp: Series = []
  const tr: Series = []
  for (let i = 1; i < n; i++) {
    const c = ctx.close[i]
    const cPrev = ctx.close[i - 1]
    const h = get(ctx.high, i)
    const l = get(ctx.low, i)
    if (c === undefined || cPrev === undefined || h === null || l === null) {
      bp.push(null)
      tr.push(null)
      continue
    }
    const low = Math.min(l, cPrev)
    bp.push(c - low)
    tr.push(Math.max(h, cPrev) - low)
  }
  const sum = (s: Series, end: number, len: number): number | null => {
    let acc = 0
    for (let k = 0; k < len; k++) {
      const v = get(s, end - k)
      if (v === null) return null
      acc += v
    }
    return acc
  }
  const out: Series = new Array(n).fill(null)
  for (let j = 0; j < bp.length; j++) {
    const bp7 = sum(bp, j, 7)
    const tr7 = sum(tr, j, 7)
    const bp14 = sum(bp, j, 14)
    const tr14 = sum(tr, j, 14)
    const bp28 = sum(bp, j, 28)
    const tr28 = sum(tr, j, 28)
    if (
      bp7 === null || tr7 === null || tr7 === 0 ||
      bp14 === null || tr14 === null || tr14 === 0 ||
      bp28 === null || tr28 === null || tr28 === 0
    ) {
      continue
    }
    const avg7 = bp7 / tr7
    const avg14 = bp14 / tr14
    const avg28 = bp28 / tr28
    out[j + 1] = (100 * (4 * avg7 + 2 * avg14 + avg28)) / 7
  }
  return out
}

// ---- vote helpers ----------------------------------------------------------

function maVote(name: string, line: Series, close: number): IndicatorResult {
  const v = at(line, 0)
  if (v === null || !Number.isFinite(v)) return { name, value: null, vote: null }
  const vote: Vote = v < close ? 'buy' : v > close ? 'sell' : 'neutral'
  return { name, value: v, vote }
}

// ---- main engine -----------------------------------------------------------

const MA_ORDER: Array<{ name: string; build: (ctx: Ctx) => Series }> = [
  { name: 'EMA (10)', build: (c) => emaSeries(c.closeS, 10) },
  { name: 'SMA (10)', build: (c) => smaSeries(c.closeS, 10) },
  { name: 'EMA (20)', build: (c) => emaSeries(c.closeS, 20) },
  { name: 'SMA (20)', build: (c) => smaSeries(c.closeS, 20) },
  { name: 'EMA (30)', build: (c) => emaSeries(c.closeS, 30) },
  { name: 'SMA (30)', build: (c) => smaSeries(c.closeS, 30) },
  { name: 'EMA (50)', build: (c) => emaSeries(c.closeS, 50) },
  { name: 'SMA (50)', build: (c) => smaSeries(c.closeS, 50) },
  { name: 'EMA (100)', build: (c) => emaSeries(c.closeS, 100) },
  { name: 'SMA (100)', build: (c) => smaSeries(c.closeS, 100) },
  { name: 'EMA (200)', build: (c) => emaSeries(c.closeS, 200) },
  { name: 'SMA (200)', build: (c) => smaSeries(c.closeS, 200) },
  { name: 'VWMA (20)', build: (c) => vwmaSeries(c, 20) },
  { name: 'Hull MA (9)', build: (c) => hullSeries(c.closeS, 9) },
]

function ichimokuVote(ctx: Ctx): IndicatorResult {
  const name = 'Ichimoku Base Line (9, 26, 52)'
  const conv = donchian(ctx.high, ctx.low, 9)
  const base = donchian(ctx.high, ctx.low, 26)
  const leadB = donchian(ctx.high, ctx.low, 52)
  const conversion = at(conv, 0)
  const baseLine = at(base, 0)
  const lead2 = at(leadB, 0)
  if (conversion === null || baseLine === null || lead2 === null) {
    return { name, value: null, vote: null }
  }
  // Senkou Span A, evaluated at the current bar — NO +26 forward shift. The cloud
  // is displaced only cosmetically when plotted; the rating reads it in place.
  const lead1 = (conversion + baseLine) / 2
  const close = ctx.close[ctx.close.length - 1]
  if (close === undefined) return { name, value: null, vote: null }
  // TradingView's published Ichimoku rating is reproduced VERBATIM here, including
  // the term `baseLine > lead1`. That term is self-contradictory alongside
  // `conversion > baseLine`: lead1 = avg(conversion, baseLine), so baseLine > lead1
  // ⟺ baseLine > conversion, the exact opposite of `conversion > baseLine`. The buy
  // (and, mirrored, the sell) can therefore NEVER fire — TradingView's Ichimoku row
  // is structurally always Neutral. We keep the contradiction on purpose: matching
  // the gauge means reproducing it, not "fixing" it. (Confirmed against a live
  // TradingView Technicals tab, where the Moving Averages group shows exactly one
  // Neutral — the Ichimoku — even in strong trends.)
  const buy =
    lead1 > lead2 &&
    close > lead1 &&
    close > lead2 &&
    close > conversion &&
    conversion > baseLine &&
    baseLine > lead1
  const sell =
    lead1 < lead2 &&
    close < lead1 &&
    close < lead2 &&
    close < conversion &&
    conversion < baseLine &&
    baseLine < lead1
  return { name, value: baseLine, vote: buy ? 'buy' : sell ? 'sell' : 'neutral' }
}

function buildOscillators(ctx: Ctx): IndicatorResult[] {
  const out: IndicatorResult[] = []

  // Trend filter shared by Stochastic RSI and Bull Bear Power (spec §3.1):
  // EMA(50) vs SMA(50). n/a until 50 bars exist, which excludes those two.
  const ema50 = at(emaSeries(ctx.closeS, 50), 0)
  const sma50 = at(smaSeries(ctx.closeS, 50), 0)
  const upTrend = ema50 !== null && sma50 !== null ? ema50 > sma50 : null
  const downTrend = ema50 !== null && sma50 !== null ? ema50 < sma50 : null

  // 1. RSI (14)
  {
    const rsi = rsiSeries(ctx.close, 14)
    const v = at(rsi, 0)
    const p = at(rsi, 1)
    let vote: Vote | null = null
    if (v !== null && p !== null) {
      vote = v < 30 && v > p ? 'buy' : v > 70 && v < p ? 'sell' : 'neutral'
    }
    out.push({ name: 'Relative Strength Index (14)', value: v, vote })
  }

  // 2. Stochastic %K (14, 3, 3)
  // The previous-bar terms (k1<d1 for buy, k1>d1 for sell) are intentional: they
  // require the %K/%D cross to have just happened. This matches TradingView's
  // actual engine (Compute.Stoch uses `k>d and k1<d1`), even though the Help Center
  // prose omits them. Stochastic RSI (#8 below) deliberately has NO such term.
  {
    const { k, d } = stochKD(ctx.high, ctx.low, ctx.closeS, 14, 3, 3)
    const k0 = at(k, 0)
    const d0 = at(d, 0)
    const k1 = at(k, 1)
    const d1 = at(d, 1)
    let vote: Vote | null = null
    if (k0 !== null && d0 !== null && k1 !== null && d1 !== null) {
      vote =
        k0 < 20 && d0 < 20 && k0 > d0 && k1 < d1
          ? 'buy'
          : k0 > 80 && d0 > 80 && k0 < d0 && k1 > d1
            ? 'sell'
            : 'neutral'
    }
    out.push({ name: 'Stochastic %K (14, 3, 3)', value: k0, vote })
  }

  // 3. CCI (20)
  {
    const cci = cciSeries(ctx, 20)
    const v = at(cci, 0)
    const p = at(cci, 1)
    let vote: Vote | null = null
    if (v !== null && p !== null) {
      vote = v < -100 && v > p ? 'buy' : v > 100 && v < p ? 'sell' : 'neutral'
    }
    out.push({ name: 'Commodity Channel Index (20)', value: v, vote })
  }

  // 4. ADX (14)
  {
    const { adx, plusDI, minusDI } = adxSeries(ctx, 14, 14)
    const a = at(adx, 0)
    const aPrev = at(adx, 1)
    const plus = at(plusDI, 0)
    const minus = at(minusDI, 0)
    let vote: Vote | null = null
    if (a !== null && aPrev !== null && plus !== null && minus !== null) {
      vote =
        plus > minus && a > 20 && a > aPrev
          ? 'buy'
          : plus < minus && a > 20 && a < aPrev
            ? 'sell'
            : 'neutral'
    }
    out.push({ name: 'Average Directional Index (14)', value: a, vote })
  }

  // 5. Awesome Oscillator
  {
    const ao = awesomeSeries(ctx)
    const a0 = at(ao, 0)
    const a1 = at(ao, 1)
    const a2 = at(ao, 2)
    let vote: Vote | null = null
    if (a0 !== null && a1 !== null && a2 !== null) {
      const crossUp = a0 > 0 && a1 < 0
      const saucerUp = a0 > 0 && a1 > 0 && a0 > a1 && a2 > a1
      const crossDown = a0 < 0 && a1 > 0
      const saucerDown = a0 < 0 && a1 < 0 && a0 < a1 && a2 < a1
      vote = crossUp || saucerUp ? 'buy' : crossDown || saucerDown ? 'sell' : 'neutral'
    }
    out.push({ name: 'Awesome Oscillator', value: a0, vote })
  }

  // 6. Momentum (10)
  {
    const mom = momentumSeries(ctx.close, 10)
    const v = at(mom, 0)
    const p = at(mom, 1)
    let vote: Vote | null = null
    if (v !== null && p !== null) {
      vote = v > p ? 'buy' : v < p ? 'sell' : 'neutral'
    }
    out.push({ name: 'Momentum (10)', value: v, vote })
  }

  // 7. MACD (12, 26, 9)
  {
    const { macd, signal } = macdSeries(ctx)
    const m = at(macd, 0)
    const s = at(signal, 0)
    let vote: Vote | null = null
    if (m !== null && s !== null) {
      vote = m > s ? 'buy' : m < s ? 'sell' : 'neutral'
    }
    out.push({ name: 'MACD Level (12, 26, 9)', value: m, vote })
  }

  // 8. Stochastic RSI Fast (3, 3, 14, 14) — gated by the trend filter (inverted).
  // The stochastic is applied to the RSI series itself, so the high/low band is
  // taken from RSI (not price): rawK = 100·(rsi − lowest(rsi))/(highest(rsi) − lowest(rsi)).
  {
    const rsi = rsiSeries(ctx.close, 14)
    const { k, d } = stochKD(rsi, rsi, rsi, 14, 3, 3)
    const k0 = at(k, 0)
    const d0 = at(d, 0)
    let vote: Vote | null = null
    if (k0 !== null && d0 !== null && upTrend !== null && downTrend !== null) {
      vote =
        downTrend && k0 < 20 && d0 < 20 && k0 > d0
          ? 'buy'
          : upTrend && k0 > 80 && d0 > 80 && k0 < d0
            ? 'sell'
            : 'neutral'
    }
    out.push({ name: 'Stochastic RSI Fast (3, 3, 14, 14)', value: k0, vote })
  }

  // 9. Williams %R (14)
  {
    const hh = highestSeries(ctx.high, 14)
    const ll = lowestSeries(ctx.low, 14)
    const wpr: Series = ctx.close.map((c, i) => {
      const h = get(hh, i)
      const l = get(ll, i)
      if (h === null || l === null) return null
      const range = h - l
      if (range === 0) return null
      return (100 * (c - h)) / range
    })
    const v = at(wpr, 0)
    const p = at(wpr, 1)
    let vote: Vote | null = null
    if (v !== null && p !== null) {
      vote = v < -80 && v > p ? 'buy' : v > -20 && v < p ? 'sell' : 'neutral'
    }
    out.push({ name: 'Williams Percent Range (14)', value: v, vote })
  }

  // 10. Bull Bear Power (13) — gated by the trend filter.
  {
    const ema13 = emaSeries(ctx.closeS, 13)
    const bull: Series = ctx.close.map((_, i) => {
      const e = get(ema13, i)
      const h = get(ctx.high, i)
      if (e === null || h === null) return null
      return h - e
    })
    const bear: Series = ctx.close.map((_, i) => {
      const e = get(ema13, i)
      const l = get(ctx.low, i)
      if (e === null || l === null) return null
      return l - e
    })
    const bull0 = at(bull, 0)
    const bull1 = at(bull, 1)
    const bear0 = at(bear, 0)
    const bear1 = at(bear, 1)
    let vote: Vote | null = null
    let value: number | null = null
    if (bull0 !== null && bear0 !== null) value = bull0 + bear0
    if (
      bull0 !== null && bull1 !== null && bear0 !== null && bear1 !== null &&
      upTrend !== null && downTrend !== null
    ) {
      vote =
        upTrend && bear0 < 0 && bear0 > bear1
          ? 'buy'
          : downTrend && bull0 > 0 && bull0 < bull1
            ? 'sell'
            : 'neutral'
    }
    out.push({ name: 'Bull Bear Power (13)', value, vote })
  }

  // 11. Ultimate Oscillator (7, 14, 28)
  {
    const uo = ultimateSeries(ctx)
    const v = at(uo, 0)
    let vote: Vote | null = null
    if (v !== null) vote = v > 70 ? 'buy' : v < 30 ? 'sell' : 'neutral'
    out.push({ name: 'Ultimate Oscillator (7, 14, 28)', value: v, vote })
  }

  return out
}

function summarize(indicators: IndicatorResult[]): GroupRating {
  let sum = 0
  let buy = 0
  let neutral = 0
  let sell = 0
  let counted = 0
  for (const ind of indicators) {
    if (ind.vote === null) continue // excluded — no data
    counted++
    if (ind.vote === 'buy') {
      sum += 1
      buy++
    } else if (ind.vote === 'sell') {
      sum -= 1
      sell++
    } else {
      neutral++
    }
  }
  const score = counted === 0 ? null : sum / counted
  return { score, signal: labelFor(score), buy, neutral, sell, indicators }
}

// Label bands over [-1, 1], inclusive TOWARD zero — matching TradingView's actual
// engine (Compute.Recommend: `value > .1 and value <= .5 → Buy`). So the exact
// boundaries resolve: -0.5 → Sell, -0.1 → Neutral, 0.1 → Neutral, 0.5 → Buy.
// (The Help Center prose reads the edges the other way; the shipped gauge does not.)
export function labelFor(score: number | null): Signal | null {
  if (score === null || Number.isNaN(score)) return null
  if (score < -0.5) return 'Strong Sell'
  if (score < -0.1) return 'Sell'
  if (score <= 0.1) return 'Neutral'
  if (score <= 0.5) return 'Buy'
  return 'Strong Buy'
}

export function computeTechnicalRating(candles: RatingCandle[]): TechnicalRating {
  const points = [...candles]
    .map((c) => ({
      t: c.timestamp instanceof Date ? c.timestamp.getTime() : new Date(c.timestamp).getTime(),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume),
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.close))
    .sort((a, b) => a.t - b.t)

  const empty: TechnicalRating = {
    movingAverages: { score: null, signal: null, buy: 0, neutral: 0, sell: 0, indicators: [] },
    oscillators: { score: null, signal: null, buy: 0, neutral: 0, sell: 0, indicators: [] },
    summary: { score: null, signal: null, buy: 0, neutral: 0, sell: 0 },
    lastClose: null,
    asOf: null,
    candleCount: points.length,
  }
  const lastPoint = points[points.length - 1]
  if (!lastPoint) return empty

  const ctx: Ctx = {
    open: points.map((p) => p.open),
    high: points.map((p) => p.high),
    low: points.map((p) => p.low),
    close: points.map((p) => p.close),
    closeS: points.map((p) => p.close),
    volume: points.map((p) => (Number.isFinite(p.volume) ? p.volume : null)),
  }

  const close = lastPoint.close
  const maIndicators = MA_ORDER.map((m) => maVote(m.name, m.build(ctx), close))
  maIndicators.push(ichimokuVote(ctx))
  const oscIndicators = buildOscillators(ctx)

  const movingAverages = summarize(maIndicators)
  const oscillators = summarize(oscIndicators)

  // spec §4: summary = mean of the two GROUP means (equal group weighting), not a
  // flat average over all 26 votes. Fall back to whichever group is valid alone.
  let summaryScore: number | null
  if (movingAverages.score !== null && oscillators.score !== null) {
    summaryScore = (movingAverages.score + oscillators.score) / 2
  } else {
    summaryScore = movingAverages.score ?? oscillators.score
  }

  return {
    movingAverages,
    oscillators,
    summary: {
      score: summaryScore,
      signal: labelFor(summaryScore),
      buy: movingAverages.buy + oscillators.buy,
      neutral: movingAverages.neutral + oscillators.neutral,
      sell: movingAverages.sell + oscillators.sell,
    },
    lastClose: close,
    asOf: new Date(lastPoint.t).toISOString(),
    candleCount: points.length,
  }
}

// ---- timeframe resampling --------------------------------------------------
// TradingView shows the rating across timeframes. We get 1W and 1M for free by
// aggregating the already-fetched daily candles (no extra API calls). Weeks are
// Monday-aligned and months are calendar months, both in IST — matching how NSE
// higher-timeframe candles bucket.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export type Timeframe = '1D' | '1W' | '1M'

function bucketKey(tMs: number, timeframe: Timeframe): number {
  if (timeframe === '1D') return Math.floor((tMs + IST_OFFSET_MS) / DAY_MS)
  if (timeframe === '1W') {
    const dayNum = Math.floor((tMs + IST_OFFSET_MS) / DAY_MS)
    // Epoch day 0 was a Thursday; day 4 was the first Monday. Shift so each
    // bucket runs Monday→Sunday.
    return Math.floor((dayNum - 4) / 7)
  }
  // Monthly: year*12 + month in IST.
  const d = new Date(tMs + IST_OFFSET_MS)
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

export function resampleCandles(candles: RatingCandle[], timeframe: Timeframe): RatingCandle[] {
  if (timeframe === '1D') return candles
  const points = [...candles]
    .map((c) => ({
      raw: c,
      t: c.timestamp instanceof Date ? c.timestamp.getTime() : new Date(c.timestamp).getTime(),
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t)

  const out: RatingCandle[] = []
  let curKey: number | null = null
  let agg: RatingCandle | null = null
  for (const { raw, t } of points) {
    const key = bucketKey(t, timeframe)
    if (curKey === null || key !== curKey) {
      if (agg) out.push(agg)
      curKey = key
      agg = { ...raw }
    } else if (agg) {
      agg = {
        timestamp: raw.timestamp, // last candle's stamp closes the bucket
        open: agg.open,
        high: Math.max(agg.high, Number(raw.high)),
        low: Math.min(agg.low, Number(raw.low)),
        close: Number(raw.close),
        volume: agg.volume + Number(raw.volume),
      }
    }
  }
  if (agg) out.push(agg)
  return out
}
