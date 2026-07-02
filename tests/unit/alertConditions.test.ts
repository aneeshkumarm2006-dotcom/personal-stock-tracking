import { describe, it, expect } from 'vitest'

import { evaluateCondition, type EvaluableAlert } from '@/lib/alerts/conditions'
import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import type { IndicatorSnapshotData } from '@/lib/indicators/types'

const NOW = new Date('2024-06-01T10:00:00Z')

function snap(partial: Partial<PriceSnapshotData>): PriceSnapshotData {
  return { token: 'T1', fetchedAt: NOW, ...partial }
}

function ind(partial: Partial<IndicatorSnapshotData>): IndicatorSnapshotData {
  return {
    token: 'T1',
    asOfCandle: '2024-05-31T00:00:00.000Z',
    sma: {},
    ema: {},
    rsi14: null,
    macd: null,
    macdSignal: null,
    prevMacd: null,
    prevSignal: null,
    rating: {},
    prevRating: {},
    high52w: null,
    low52w: null,
    avgVolume20d: null,
    ...partial,
  }
}

describe('evaluateCondition', () => {
  it('price: legacy alert with no type is treated as price', () => {
    const alert: EvaluableAlert = { targetPrice: 100, direction: 'below' }
    expect(evaluateCondition(alert, snap({ ltp: 100 })).hit).toBe(true)
    expect(evaluateCondition(alert, snap({ ltp: 101 })).hit).toBe(false)
  })

  it('price: above fires at/above target', () => {
    const alert: EvaluableAlert = {
      type: 'price',
      targetPrice: 100,
      direction: 'above',
    }
    expect(evaluateCondition(alert, snap({ ltp: 100 })).hit).toBe(true)
    expect(evaluateCondition(alert, snap({ ltp: 99 })).hit).toBe(false)
  })

  it('pct_change: up and down thresholds', () => {
    const up: EvaluableAlert = {
      type: 'pct_change',
      direction: 'above',
      config: { thresholdPct: 5 },
    }
    expect(evaluateCondition(up, snap({ ltp: 1, pctChange: 5 })).hit).toBe(true)
    expect(evaluateCondition(up, snap({ ltp: 1, pctChange: 4.9 })).hit).toBe(
      false,
    )
    const down: EvaluableAlert = {
      type: 'pct_change',
      direction: 'below',
      config: { thresholdPct: 5 },
    }
    expect(evaluateCondition(down, snap({ ltp: 1, pctChange: -5 })).hit).toBe(
      true,
    )
    expect(evaluateCondition(down, snap({ ltp: 1, pctChange: -4 })).hit).toBe(
      false,
    )
  })

  it('volume: needs tradeVolume and an avgVolume20d baseline', () => {
    const alert: EvaluableAlert = {
      type: 'volume',
      config: { mode: 'spike', multiple: 2 },
    }
    const s = snap({ ltp: 1, tradeVolume: 2_000_000 })
    expect(evaluateCondition(alert, s, ind({ avgVolume20d: 900_000 })).hit).toBe(
      true,
    )
    expect(
      evaluateCondition(alert, s, ind({ avgVolume20d: 1_100_000 })).hit,
    ).toBe(false)
    // No indicator baseline → never fires.
    expect(evaluateCondition(alert, s).hit).toBe(false)
  })

  it('week52: high/low breakout with margin, quote field preferred', () => {
    const high: EvaluableAlert = { type: 'week52', config: { edge: 'high' } }
    expect(
      evaluateCondition(high, snap({ ltp: 500, week52High: 500 })).hit,
    ).toBe(true)
    expect(
      evaluateCondition(high, snap({ ltp: 499, week52High: 500 })).hit,
    ).toBe(false)
    // Margin requires a further push above the high.
    const highMargin: EvaluableAlert = {
      type: 'week52',
      config: { edge: 'high', marginPct: 1 },
    }
    expect(
      evaluateCondition(highMargin, snap({ ltp: 505, week52High: 500 })).hit,
    ).toBe(true)
    expect(
      evaluateCondition(highMargin, snap({ ltp: 502, week52High: 500 })).hit,
    ).toBe(false)
    // Falls back to the indicator's close-based low when the quote omits it.
    const low: EvaluableAlert = { type: 'week52', config: { edge: 'low' } }
    expect(
      evaluateCondition(low, snap({ ltp: 90 }), ind({ low52w: 90 })).hit,
    ).toBe(true)
  })

  it('circuit: upper / lower / either', () => {
    const s = snap({ ltp: 110, upperCircuit: 110, lowerCircuit: 90 })
    expect(
      evaluateCondition({ type: 'circuit', config: { band: 'upper' } }, s).hit,
    ).toBe(true)
    expect(
      evaluateCondition({ type: 'circuit', config: { band: 'lower' } }, s).hit,
    ).toBe(false)
    expect(
      evaluateCondition(
        { type: 'circuit', config: { band: 'either' } },
        snap({ ltp: 90, upperCircuit: 110, lowerCircuit: 90 }),
      ).hit,
    ).toBe(true)
  })

  it('sma_cross / ema_cross: compare ltp to the precomputed line, skip without indicator', () => {
    const below: EvaluableAlert = {
      type: 'sma_cross',
      direction: 'below',
      config: { period: 20 },
    }
    expect(
      evaluateCondition(below, snap({ ltp: 95 }), ind({ sma: { '20': 100 } }))
        .hit,
    ).toBe(true)
    expect(
      evaluateCondition(below, snap({ ltp: 101 }), ind({ sma: { '20': 100 } }))
        .hit,
    ).toBe(false)
    // Missing indicator (or missing that period) → skip.
    expect(evaluateCondition(below, snap({ ltp: 95 })).hit).toBe(false)
    expect(
      evaluateCondition(below, snap({ ltp: 95 }), ind({ sma: {} })).hit,
    ).toBe(false)

    const emaAbove: EvaluableAlert = {
      type: 'ema_cross',
      direction: 'above',
      config: { period: 50 },
    }
    expect(
      evaluateCondition(
        emaAbove,
        snap({ ltp: 205 }),
        ind({ ema: { '50': 200 } }),
      ).hit,
    ).toBe(true)
  })

  it('rsi: overbought / oversold with default and custom thresholds', () => {
    const ob: EvaluableAlert = { type: 'rsi', config: { rsiBand: 'overbought' } }
    expect(evaluateCondition(ob, snap({ ltp: 1 }), ind({ rsi14: 72 })).hit).toBe(
      true,
    )
    expect(evaluateCondition(ob, snap({ ltp: 1 }), ind({ rsi14: 69 })).hit).toBe(
      false,
    )
    const osCustom: EvaluableAlert = {
      type: 'rsi',
      config: { rsiBand: 'oversold', threshold: 25 },
    }
    expect(
      evaluateCondition(osCustom, snap({ ltp: 1 }), ind({ rsi14: 24 })).hit,
    ).toBe(true)
    expect(
      evaluateCondition(osCustom, snap({ ltp: 1 }), ind({ rsi14: 26 })).hit,
    ).toBe(false)
    expect(evaluateCondition(ob, snap({ ltp: 1 })).hit).toBe(false)
  })

  it('macd_cross: bullish and bearish crosses, not a mere level', () => {
    const bull: EvaluableAlert = {
      type: 'macd_cross',
      config: { macdDirection: 'bullish' },
    }
    // Crossed up this session.
    expect(
      evaluateCondition(
        bull,
        snap({ ltp: 1 }),
        ind({ prevMacd: -1, prevSignal: 0, macd: 1, macdSignal: 0 }),
      ).hit,
    ).toBe(true)
    // Already above, no fresh cross.
    expect(
      evaluateCondition(
        bull,
        snap({ ltp: 1 }),
        ind({ prevMacd: 1, prevSignal: 0, macd: 2, macdSignal: 0 }),
      ).hit,
    ).toBe(false)
    const bear: EvaluableAlert = {
      type: 'macd_cross',
      config: { macdDirection: 'bearish' },
    }
    expect(
      evaluateCondition(
        bear,
        snap({ ltp: 1 }),
        ind({ prevMacd: 1, prevSignal: 0, macd: -1, macdSignal: 0 }),
      ).hit,
    ).toBe(true)
  })

  it('rating_flip: fires on a bucket change, honouring the target bucket', () => {
    const toAny: EvaluableAlert = {
      type: 'rating_flip',
      config: { timeframe: '1D', to: 'any' },
    }
    expect(
      evaluateCondition(
        toAny,
        snap({ ltp: 1 }),
        ind({ rating: { '1D': 'buy' }, prevRating: { '1D': 'neutral' } }),
      ).hit,
    ).toBe(true)
    // No flip.
    expect(
      evaluateCondition(
        toAny,
        snap({ ltp: 1 }),
        ind({ rating: { '1D': 'buy' }, prevRating: { '1D': 'buy' } }),
      ).hit,
    ).toBe(false)
    // Flip to a specific bucket must match.
    const toBuy: EvaluableAlert = {
      type: 'rating_flip',
      config: { timeframe: '1D', to: 'buy' },
    }
    expect(
      evaluateCondition(
        toBuy,
        snap({ ltp: 1 }),
        ind({ rating: { '1D': 'sell' }, prevRating: { '1D': 'neutral' } }),
      ).hit,
    ).toBe(false)
    // Missing indicator → skip.
    expect(evaluateCondition(toAny, snap({ ltp: 1 })).hit).toBe(false)
  })
})
