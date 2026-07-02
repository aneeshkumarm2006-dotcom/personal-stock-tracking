import { describe, it, expect } from 'vitest'

import { computeIndicators } from '@/lib/indicators/compute'
import type { CandleData } from '@/lib/angelone/historical'

// 60 daily candles with strictly increasing closes 1..60 and constant volume, so
// the derived values are hand-checkable.
function ascendingCandles(n: number): CandleData[] {
  const base = Date.UTC(2024, 0, 1)
  const DAY = 24 * 60 * 60 * 1000
  const out: CandleData[] = []
  for (let i = 0; i < n; i++) {
    const close = i + 1
    out.push({
      timestamp: new Date(base + i * DAY),
      open: close,
      high: close,
      low: close,
      close,
      volume: 1000,
    })
  }
  return out
}

describe('computeIndicators', () => {
  it('computes SMA/EMA/RSI/volume/52w from daily candles', () => {
    const candles = ascendingCandles(60)
    const ind = computeIndicators('T1', 'NSE', candles)

    // SMA(5) of closes 56..60 = 58; SMA(20) of 41..60 = 50.5.
    expect(ind.sma['5']).toBe(58)
    expect(ind.sma['20']).toBe(50.5)
    expect(typeof ind.ema['20']).toBe('number')

    // Monotonically rising series → no losses → RSI pinned at 100.
    expect(ind.rsi14).toBe(100)

    expect(ind.avgVolume20d).toBe(1000)
    expect(ind.high52w).toBe(60)
    expect(ind.low52w).toBe(1)

    // 60 ≥ 26+9 candles, so MACD is defined.
    expect(typeof ind.macd).toBe('number')
    expect(typeof ind.macdSignal).toBe('number')

    expect(ind.token).toBe('T1')
    expect(ind.exchange).toBe('NSE')
    expect(ind.asOfCandle).toBe(candles.at(-1)!.timestamp.toISOString())
  })

  it('leaves long-window indicators null when history is too short', () => {
    const ind = computeIndicators('T1', 'NSE', ascendingCandles(10))
    expect(ind.sma['5']).toBe(8) // (6+7+8+9+10)/5
    expect(ind.sma['20']).toBeUndefined()
    expect(ind.macd).toBeNull()
  })
})
