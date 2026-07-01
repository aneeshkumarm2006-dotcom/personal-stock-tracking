import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock only the low-level Angel client so both getQuotes (marketData) and the
// candle fallback it delegates to (getCandleData, via getCandles) run for real.
const marketData = vi.fn()
const getCandleData = vi.fn()

vi.mock('@/lib/angelone/client', () => ({
  getSmartApi: () => ({ marketData, getCandleData }),
  // Pass-through: exercise the real retry-wrapped bodies without backoff.
  withRetry: (fn: () => Promise<unknown>) => fn(),
}))

import { getQuotes } from '@/lib/angelone/quotes'
import { clearCandleCache } from '@/lib/angelone/historical'

function quoteOk(fetched: unknown[], unfetched: unknown[] = []) {
  return { status: true, message: 'SUCCESS', data: { fetched, unfetched } }
}

// Two daily candles: previous session then latest, mirroring VISL-BE (750324).
const VISL_CANDLES = {
  status: true,
  data: [
    ['2026-06-30T00:00:00+05:30', 33.9, 35.66, 32.45, 35.26, 235299018],
    ['2026-07-01T00:00:00+05:30', 36.48, 38.78, 36.25, 38.78, 110897072],
  ],
}

beforeEach(() => {
  marketData.mockReset()
  getCandleData.mockReset()
  clearCandleCache()
})

describe('getQuotes candle fallback for unfetched (AB4030) tokens', () => {
  it('backfills a token the quote endpoint drops with its latest daily candle close', async () => {
    marketData.mockResolvedValue(
      quoteOk(
        [{ exchange: 'NSE', tradingSymbol: 'SBIN-EQ', symbolToken: '3045', ltp: 1042 }],
        [{ exchange: 'NSE', symbolToken: '750324', errorCode: 'AB4030' }],
      ),
    )
    getCandleData.mockResolvedValue(VISL_CANDLES)

    const snaps = await getQuotes({ NSE: ['3045', '750324'] }, 'FULL')

    const eq = snaps.find((s) => s.token === '3045')
    const be = snaps.find((s) => s.token === '750324')

    expect(eq?.ltp).toBe(1042)
    expect(be).toBeDefined()
    expect(be?.ltp).toBe(38.78) // latest daily close = live-ish price
    expect(be?.close).toBe(35.26) // previous session close (for day-change)
    expect(be?.netChange).toBe(3.52)
    expect(be?.pctChange).toBe(9.98)
    expect(be?.open).toBe(36.48)
    expect(be?.exchange).toBe('NSE')

    expect(getCandleData).toHaveBeenCalledTimes(1)
    expect(getCandleData).toHaveBeenCalledWith(
      expect.objectContaining({ symboltoken: '750324', exchange: 'NSE', interval: 'ONE_DAY' }),
    )
  })

  it('does not fetch candles when every requested token is priced normally', async () => {
    marketData.mockResolvedValue(
      quoteOk([{ exchange: 'NSE', tradingSymbol: 'SBIN-EQ', symbolToken: '3045', ltp: 1042 }]),
    )

    const snaps = await getQuotes({ NSE: ['3045'] }, 'FULL')

    expect(snaps).toHaveLength(1)
    expect(getCandleData).not.toHaveBeenCalled()
  })

  it('leaves a token out (no throw) when it is unfetched and has no candles either', async () => {
    marketData.mockResolvedValue(
      quoteOk([], [{ exchange: 'NSE', symbolToken: '750324', errorCode: 'AB4030' }]),
    )
    getCandleData.mockResolvedValue({ status: true, data: [] })

    const snaps = await getQuotes({ NSE: ['750324'] }, 'FULL')

    expect(snaps).toHaveLength(0)
    expect(getCandleData).toHaveBeenCalledTimes(1)
  })

  it('reports no day-change when only a single candle is available', async () => {
    marketData.mockResolvedValue(
      quoteOk([], [{ exchange: 'NSE', symbolToken: '750324', errorCode: 'AB4030' }]),
    )
    getCandleData.mockResolvedValue({
      status: true,
      data: [['2026-07-01T00:00:00+05:30', 36.48, 38.78, 36.25, 38.78, 1]],
    })

    const snaps = await getQuotes({ NSE: ['750324'] }, 'FULL')
    const be = snaps.find((s) => s.token === '750324')

    expect(be?.ltp).toBe(38.78)
    expect(be?.close).toBeUndefined()
    expect(be?.netChange).toBeUndefined()
  })
})
