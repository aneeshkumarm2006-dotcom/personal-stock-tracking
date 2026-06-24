import { describe, it, expect } from 'vitest'

import {
  buildWealthSeries,
  type WealthSeriesInput,
  type WealthTx,
} from '@/lib/portfolio/wealthSeries'

const baseInput = (overrides: Partial<WealthSeriesInput>): WealthSeriesInput => ({
  transactions: [],
  tradingDates: [],
  closesByToken: new Map(),
  niftyCloses: new Map(),
  fundsAdded: 0,
  fdAnnualRate: 0.075,
  ...overrides,
})

const buy = (
  token: string,
  date: string,
  quantity: number,
  price: number,
  charges?: WealthTx['charges'],
): WealthTx => ({ instrumentToken: token, type: 'BUY', date, quantity, price, charges })

const sell = (
  token: string,
  date: string,
  quantity: number,
  price: number,
): WealthTx => ({ instrumentToken: token, type: 'SELL', date, quantity, price })

describe('buildWealthSeries', () => {
  it('returns empty for no transactions', () => {
    expect(buildWealthSeries(baseInput({ tradingDates: ['2026-01-01'] }))).toEqual([])
  })

  it('returns empty when there are no trading dates', () => {
    expect(
      buildWealthSeries(baseInput({ transactions: [buy('T1', '2026-01-01', 1, 100)] })),
    ).toEqual([])
  })

  it('values open holdings at each day close', () => {
    const series = buildWealthSeries(
      baseInput({
        transactions: [buy('T1', '2026-01-01', 10, 100)],
        tradingDates: ['2026-01-01', '2026-01-02'],
        closesByToken: new Map([
          [
            'T1',
            new Map([
              ['2026-01-01', 100],
              ['2026-01-02', 110],
            ]),
          ],
        ]),
        niftyCloses: new Map([
          ['2026-01-01', 20000],
          ['2026-01-02', 21000],
        ]),
      }),
    )

    expect(series).toHaveLength(2)
    expect(series[0]).toMatchObject({ date: '2026-01-01', investmentValue: 1000 })
    expect(series[1]).toMatchObject({ date: '2026-01-02', investmentValue: 1100 })
  })

  it('carries forward the last known close on days without a candle', () => {
    const series = buildWealthSeries(
      baseInput({
        transactions: [buy('T1', '2026-01-01', 10, 100)],
        tradingDates: ['2026-01-01', '2026-01-02', '2026-01-03'],
        closesByToken: new Map([
          [
            'T1',
            new Map([
              ['2026-01-01', 100],
              ['2026-01-03', 130],
            ]),
          ],
        ]),
        niftyCloses: new Map([
          ['2026-01-01', 20000],
          ['2026-01-02', 20000],
          ['2026-01-03', 20000],
        ]),
      }),
    )

    // 2026-01-02 has no candle for T1 → carry forward 100.
    expect(series[1]).toMatchObject({ date: '2026-01-02', investmentValue: 1000 })
    expect(series[2]).toMatchObject({ date: '2026-01-03', investmentValue: 1300 })
  })

  it('drops a sold-out holding from investment value (proceeds land in cash)', () => {
    const series = buildWealthSeries(
      baseInput({
        fundsAdded: 5000,
        transactions: [buy('T1', '2026-01-01', 10, 100), sell('T1', '2026-01-02', 10, 120)],
        tradingDates: ['2026-01-01', '2026-01-02'],
        closesByToken: new Map([
          [
            'T1',
            new Map([
              ['2026-01-01', 100],
              ['2026-01-02', 120],
            ]),
          ],
        ]),
        niftyCloses: new Map([
          ['2026-01-01', 20000],
          ['2026-01-02', 20000],
        ]),
      }),
    )

    // Day 1: bought for 1000 → cash 4000, holding worth 1000.
    expect(series[0]).toMatchObject({ cash: 4000, investmentValue: 1000 })
    // Day 2: sold all for 1200 → netInvested = 1000 - 1200 = -200, cash 5200,
    // no open holding left.
    expect(series[1]).toMatchObject({ cash: 5200, investmentValue: 0 })
  })

  it('a buy charge lifts ATP but is NOT deducted from the cash line', () => {
    const series = buildWealthSeries(
      baseInput({
        fundsAdded: 5000,
        transactions: [buy('T1', '2026-01-01', 10, 100, { total: 50 })],
        tradingDates: ['2026-01-01'],
        closesByToken: new Map([['T1', new Map([['2026-01-01', 100]])]]),
        niftyCloses: new Map([['2026-01-01', 20000]]),
      }),
    )

    // Cash drops by 10*100 = 1000 only; the 50 charge is not debited from cash.
    expect(series[0]).toMatchObject({ cash: 4000 })
  })

  it('grows the Nifty benchmark from the lump-sum principal at day one', () => {
    const series = buildWealthSeries(
      baseInput({
        transactions: [buy('T1', '2026-01-01', 10, 100, { brokerage: 50 })],
        tradingDates: ['2026-01-01', '2026-01-02'],
        closesByToken: new Map([['T1', new Map([['2026-01-01', 100]])]]),
        niftyCloses: new Map([
          ['2026-01-01', 20000],
          ['2026-01-02', 22000], // +10%
        ]),
      }),
    )

    // Principal = 10*100 + 50 charges = 1050, deployed at day one.
    expect(series[0]!.niftyValue).toBe(1050)
    // +10% on the index → 1155.
    expect(series[1]!.niftyValue).toBe(1155)
  })

  it('compounds the FD benchmark at the annual rate', () => {
    const series = buildWealthSeries(
      baseInput({
        transactions: [buy('T1', '2026-01-01', 10, 100)],
        // ~1 year later (using 365.25-day years, 2026-12-31 ≈ 0.9966 yr).
        tradingDates: ['2026-01-01', '2026-12-31'],
        closesByToken: new Map([['T1', new Map([['2026-01-01', 100]])]]),
        niftyCloses: new Map([
          ['2026-01-01', 20000],
          ['2026-12-31', 20000],
        ]),
        fdAnnualRate: 0.075,
      }),
    )

    expect(series[0]!.fdValue).toBe(1000)
    // Just under a full year of 7.5% growth.
    expect(series[1]!.fdValue).toBeGreaterThan(1070)
    expect(series[1]!.fdValue).toBeLessThan(1075)
  })

  it('ignores trading dates before the first purchase', () => {
    const series = buildWealthSeries(
      baseInput({
        transactions: [buy('T1', '2026-01-05', 10, 100)],
        tradingDates: ['2026-01-01', '2026-01-05'],
        closesByToken: new Map([['T1', new Map([['2026-01-05', 100]])]]),
        niftyCloses: new Map([
          ['2026-01-01', 20000],
          ['2026-01-05', 20000],
        ]),
      }),
    )

    expect(series).toHaveLength(1)
    expect(series[0]!.date).toBe('2026-01-05')
  })
})
