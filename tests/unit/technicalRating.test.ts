import { describe, it, expect } from 'vitest'
import {
  computeTechnicalRating,
  labelFor,
  resampleCandles,
  type RatingCandle,
} from '@/lib/research/technicalRating'

const DAY_MS = 24 * 60 * 60 * 1000

// Build `n` daily candles ending at a fixed IST anchor, with OHLC all equal to
// fn(i) (i counts oldest→newest). Equal OHLC keeps hand-derivation tractable.
function flatOHLC(n: number, fn: (i: number) => number, volume = 1000): RatingCandle[] {
  const end = Date.UTC(2024, 5, 28)
  const out: RatingCandle[] = []
  for (let i = 0; i < n; i++) {
    const t = end - (n - 1 - i) * DAY_MS
    const v = fn(i)
    out.push({ timestamp: new Date(t).toISOString(), open: v, high: v, low: v, close: v, volume })
  }
  return out
}

// A convex (accelerating) rise/fall. Unlike a perfectly linear ramp — on which
// the (zero-lag) Hull MA exactly equals the close and votes Neutral — a convex
// trend keeps every MA strictly on one side of price, like a real trending stock.
const rise = (i: number) => 100 + i + i * i * 0.05 // accelerating up
const fall = (i: number) => 5000 - i - i * i * 0.05 // accelerating down (mirror)

function osc(r: ReturnType<typeof computeTechnicalRating>, name: string) {
  return r.oscillators.indicators.find((x) => x.name.startsWith(name))
}
function ma(r: ReturnType<typeof computeTechnicalRating>, name: string) {
  return r.movingAverages.indicators.find((x) => x.name === name)
}

describe('labelFor — exact band edges (spec §5)', () => {
  it('maps the boundary values exactly', () => {
    expect(labelFor(-1)).toBe('Strong Sell')
    expect(labelFor(-0.6)).toBe('Strong Sell')
    expect(labelFor(-0.5)).toBe('Sell') // -0.5 belongs to Sell
    expect(labelFor(-0.1)).toBe('Neutral') // -0.1 belongs to Neutral
    expect(labelFor(0)).toBe('Neutral')
    expect(labelFor(0.1)).toBe('Neutral') // 0.1 belongs to Neutral
    expect(labelFor(0.5)).toBe('Buy') // 0.5 belongs to Buy
    expect(labelFor(0.51)).toBe('Strong Buy')
    expect(labelFor(1)).toBe('Strong Buy')
  })
  it('returns null for null/NaN', () => {
    expect(labelFor(null)).toBeNull()
    expect(labelFor(NaN)).toBeNull()
  })
})

describe('computeTechnicalRating — empty / insufficient input', () => {
  it('returns all-null on empty input', () => {
    const r = computeTechnicalRating([])
    expect(r.summary.score).toBeNull()
    expect(r.summary.signal).toBeNull()
    expect(r.movingAverages.score).toBeNull()
    expect(r.oscillators.score).toBeNull()
    expect(r.candleCount).toBe(0)
  })

  it('EXCLUDES indicators without enough history rather than voting Neutral', () => {
    // 30 candles: SMA/EMA 50/100/200 and Ichimoku (52) are n/a and must be
    // dropped from the denominator, NOT counted as 0.
    const r = computeTechnicalRating(flatOHLC(30, (i) => i + 1))
    const counted =
      r.movingAverages.buy + r.movingAverages.neutral + r.movingAverages.sell
    expect(counted).toBeLessThan(15)
    // The long MAs should be present in the list but unvoted.
    expect(ma(r, 'SMA (200)')?.vote).toBeNull()
    expect(ma(r, 'EMA (200)')?.vote).toBeNull()
    expect(ma(r, 'Ichimoku Base Line (9, 26, 52)')?.vote).toBeNull()
    // The short MAs that DO have data should be voting.
    expect(ma(r, 'SMA (10)')?.vote).not.toBeNull()
    // score is the mean over counted members only.
    expect(r.movingAverages.score).not.toBeNull()
  })
})

describe('exact MA values on a linear ramp', () => {
  // closes 100..349; chosen so the arithmetic is hand-checkable.
  const r = computeTechnicalRating(flatOHLC(250, (i) => 100 + i))

  it('computes the SMA(10) value exactly (mean of the last 10 closes)', () => {
    // last 10 are 340..349 → mean 344.5
    expect(ma(r, 'SMA (10)')?.value).toBeCloseTo(344.5, 6)
  })

  it('computes the Ichimoku base line exactly (donchian-26 midpoint)', () => {
    // last close 349, donchian(26) = (349 + (349-25))/2 = 336.5
    expect(ma(r, 'Ichimoku Base Line (9, 26, 52)')?.value).toBeCloseTo(336.5, 6)
  })
})

describe('computeTechnicalRating — strictly rising series', () => {
  const r = computeTechnicalRating(flatOHLC(250, rise))

  it('rates the 14 simple MAs as Buy; Ichimoku is structurally Neutral', () => {
    // Every SMA/EMA/VWMA/Hull sits below a rising price → Buy. TradingView's
    // Ichimoku rating can never fire (always Neutral), so the 15th MA is Neutral.
    expect(r.movingAverages.buy).toBe(14)
    expect(r.movingAverages.neutral).toBe(1)
    expect(r.movingAverages.sell).toBe(0)
    expect(r.movingAverages.score).toBeCloseTo(14 / 15, 6)
    expect(r.movingAverages.signal).toBe('Strong Buy')
  })

  it('keeps the Ichimoku base line Neutral (matches TradingView)', () => {
    expect(ma(r, 'Ichimoku Base Line (9, 26, 52)')?.vote).toBe('neutral')
  })

  it('RSI is 100 when there are no down moves (loss = 0)', () => {
    expect(osc(r, 'Relative Strength Index')?.value).toBeCloseTo(100, 6)
  })

  it('Ultimate Oscillator votes Buy (UO = 100 on a pure uptrend of equal OHLC)', () => {
    const uo = osc(r, 'Ultimate Oscillator')
    expect(uo?.value).toBeCloseTo(100, 6)
    expect(uo?.vote).toBe('buy')
  })

  it('summary uses EQUAL GROUP weighting: (maScore + oscScore) / 2', () => {
    const maScore = r.movingAverages.score!
    const oscScore = r.oscillators.score!
    expect(r.summary.score).toBeCloseTo((maScore + oscScore) / 2, 9)
  })
})

describe('computeTechnicalRating — strictly falling series', () => {
  const r = computeTechnicalRating(flatOHLC(250, fall))

  it('rates the 14 simple MAs as Sell; Ichimoku is structurally Neutral', () => {
    expect(r.movingAverages.sell).toBe(14)
    expect(r.movingAverages.neutral).toBe(1)
    expect(r.movingAverages.buy).toBe(0)
    expect(r.movingAverages.score).toBeCloseTo(-14 / 15, 6)
    expect(r.movingAverages.signal).toBe('Strong Sell')
  })

  it('RSI is 0 when there are no up moves (gain = 0)', () => {
    expect(osc(r, 'Relative Strength Index')?.value).toBeCloseTo(0, 6)
  })

  it('Ultimate Oscillator votes Sell (UO = 0 on a pure downtrend)', () => {
    const uo = osc(r, 'Ultimate Oscillator')
    expect(uo?.value).toBeCloseTo(0, 6)
    expect(uo?.vote).toBe('sell')
  })
})

describe('computeTechnicalRating — oscillator scale sanity', () => {
  // An oscillating market with a real high/low band each bar. Both Stochastic and
  // Stochastic-RSI are %-of-range measures and MUST stay within [0, 100]. (A prior
  // bug fed StochRSI the *price* high/low band instead of the RSI band, which sent
  // its value far outside this range.)
  const wave: RatingCandle[] = []
  for (let i = 0; i < 200; i++) {
    const b = 1000 + 50 * Math.sin(i * 0.3)
    wave.push({
      timestamp: new Date(Date.UTC(2024, 0, 1) + i * DAY_MS).toISOString(),
      open: b,
      high: b + 5,
      low: b - 5,
      close: b,
      volume: 1000,
    })
  }
  const r = computeTechnicalRating(wave)

  it('keeps Stochastic %K within [0, 100]', () => {
    const v = osc(r, 'Stochastic %K')?.value
    expect(v).not.toBeNull()
    expect(v!).toBeGreaterThanOrEqual(0)
    expect(v!).toBeLessThanOrEqual(100)
  })

  it('keeps Stochastic RSI within [0, 100]', () => {
    const v = osc(r, 'Stochastic RSI')?.value
    expect(v).not.toBeNull()
    expect(v!).toBeGreaterThanOrEqual(0)
    expect(v!).toBeLessThanOrEqual(100)
  })
})

describe('computeTechnicalRating — VWMA excluded when volume is absent', () => {
  it('drops VWMA from the MA group on a zero-volume (index-like) series', () => {
    const r = computeTechnicalRating(flatOHLC(250, rise, 0))
    expect(ma(r, 'VWMA (20)')?.vote).toBeNull()
    // 12 SMA/EMA + Hull all Buy; VWMA excluded (no volume); Ichimoku Neutral.
    expect(r.movingAverages.buy).toBe(13)
  })
})

describe('resampleCandles', () => {
  // Mon 2024-01-01 .. Sun 2024-01-07 = one week; next Mon starts a new bucket.
  function daily(dateIso: string, o: number, h: number, l: number, c: number, v: number): RatingCandle {
    return { timestamp: dateIso, open: o, high: h, low: l, close: c, volume: v }
  }
  const days: RatingCandle[] = [
    daily('2024-01-01T00:00:00+05:30', 10, 12, 9, 11, 100), // Mon
    daily('2024-01-02T00:00:00+05:30', 11, 15, 10, 14, 100), // Tue
    daily('2024-01-03T00:00:00+05:30', 14, 14, 8, 9, 100), // Wed
    daily('2024-01-04T00:00:00+05:30', 9, 13, 9, 12, 100), // Thu
    daily('2024-01-05T00:00:00+05:30', 12, 16, 11, 16, 100), // Fri
    daily('2024-01-08T00:00:00+05:30', 16, 18, 15, 17, 100), // next Mon
    daily('2024-01-09T00:00:00+05:30', 17, 20, 16, 19, 100), // Tue
  ]

  it('returns the input unchanged for 1D', () => {
    expect(resampleCandles(days, '1D')).toHaveLength(7)
  })

  it('aggregates daily candles into Monday-aligned weekly OHLCV', () => {
    const weekly = resampleCandles(days, '1W')
    expect(weekly).toHaveLength(2)
    const w1 = weekly[0]!
    expect(w1.open).toBe(10) // first open of the week
    expect(w1.high).toBe(16) // max high across Mon–Fri
    expect(w1.low).toBe(8) // min low
    expect(w1.close).toBe(16) // last close (Fri)
    expect(w1.volume).toBe(500) // 5 days summed
    const w2 = weekly[1]!
    expect(w2.open).toBe(16)
    expect(w2.close).toBe(19)
    expect(w2.volume).toBe(200)
  })

  it('aggregates into calendar-month buckets', () => {
    const jan = flatOHLC(20, () => 100) // all within one ~month window
    const monthly = resampleCandles(jan, '1M')
    // 20 consecutive days can straddle at most 2 IST months.
    expect(monthly.length).toBeGreaterThanOrEqual(1)
    expect(monthly.length).toBeLessThanOrEqual(2)
  })
})
