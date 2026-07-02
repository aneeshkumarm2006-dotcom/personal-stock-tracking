import { describe, it, expect } from 'vitest'

import { conditionLabel, describeCondition } from '@/lib/alerts/describe'

describe('describeCondition', () => {
  it('phrases price alerts by direction', () => {
    expect(
      describeCondition({ type: 'price', targetPrice: 100, direction: 'below' }),
    ).toContain('below')
    expect(
      describeCondition({ type: 'price', targetPrice: 100, direction: 'above' }),
    ).toContain('above')
  })

  it('phrases each advanced condition recognisably', () => {
    expect(
      describeCondition({
        type: 'pct_change',
        direction: 'above',
        config: { thresholdPct: 5 },
      }),
    ).toContain('≥ +5%')
    expect(
      describeCondition({ type: 'volume', config: { multiple: 2 } }),
    ).toContain('2× 20-day average')
    expect(describeCondition({ type: 'week52', config: { edge: 'high' } })).toBe(
      'breaks above 52-week high',
    )
    expect(
      describeCondition({ type: 'circuit', config: { band: 'upper' } }),
    ).toBe('hits upper circuit')
    expect(
      describeCondition({
        type: 'sma_cross',
        direction: 'below',
        config: { period: 20 },
      }),
    ).toBe('crosses below SMA(20)')
    expect(
      describeCondition({
        type: 'ema_cross',
        direction: 'above',
        config: { period: 50 },
      }),
    ).toBe('crosses above EMA(50)')
    expect(
      describeCondition({ type: 'rsi', config: { rsiBand: 'overbought' } }),
    ).toContain('RSI(14) ≥ 70')
    expect(
      describeCondition({
        type: 'macd_cross',
        config: { macdDirection: 'bullish' },
      }),
    ).toBe('MACD crosses bullish')
    expect(
      describeCondition({
        type: 'rating_flip',
        config: { timeframe: '1D', to: 'buy' },
      }),
    ).toBe('1D rating flips to buy')
  })

  it('labels the condition family', () => {
    expect(conditionLabel({ type: 'price' })).toBe('Price alert')
    expect(conditionLabel({ type: 'volume' })).toBe('Volume spike')
    expect(conditionLabel({ type: 'rsi' })).toBe('RSI')
    // Legacy (no type) reads as a price alert.
    expect(conditionLabel({})).toBe('Price alert')
  })
})
