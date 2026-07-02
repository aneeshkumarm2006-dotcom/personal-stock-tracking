import { describe, it, expect, vi } from 'vitest'

import {
  evaluateWatchlistAlerts,
  type AlertForEval,
  type WatchlistItemForEval,
} from '@/lib/watchlist/evaluate'
import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import type { IndicatorSnapshotData } from '@/lib/indicators/types'

const NOW = new Date('2024-06-01T10:00:00Z')

const snap = (
  token: string,
  ltp: number,
  pctChange?: number,
): PriceSnapshotData => ({
  token,
  ltp,
  pctChange,
  fetchedAt: NOW,
})

function makeAlert(partial: Partial<AlertForEval> = {}): AlertForEval {
  return {
    _id: 'a1',
    targetPrice: 100,
    direction: 'below',
    status: 'armed',
    note: '',
    ...partial,
  }
}

function makeItem(
  alerts: AlertForEval[],
  save: () => Promise<unknown> = vi.fn().mockResolvedValue(undefined),
  token = 'T1',
): WatchlistItemForEval {
  return {
    instrumentToken: token,
    instrumentSymbol: `${token}-EQ`,
    exchange: 'NSE',
    alerts,
    save,
  }
}

describe('evaluateWatchlistAlerts', () => {
  it('fires a below alert when LTP touches the target', async () => {
    const item = makeItem([makeAlert({ targetPrice: 100, direction: 'below' })])
    const triggered = await evaluateWatchlistAlerts(
      [item],
      [snap('T1', 100, -1.8)],
      NOW,
    )

    expect(item.alerts[0]!.status).toBe('triggered')
    expect(item.alerts[0]!.lastTriggeredAt).toBe(NOW)
    expect(item.alerts[0]!.lastTriggeredPrice).toBe(100)
    expect(item.save).toHaveBeenCalledTimes(1)
    expect(triggered).toHaveLength(1)
    expect(triggered[0]).toMatchObject({
      instrumentToken: 'T1',
      instrumentSymbol: 'T1-EQ',
      exchange: 'NSE',
      direction: 'below',
      targetPrice: 100,
      ltp: 100,
      dayChangePct: -1.8,
      triggeredAt: NOW,
    })
  })

  it('does not fire a below alert when LTP is above the target', async () => {
    const item = makeItem([makeAlert({ targetPrice: 100, direction: 'below' })])
    const triggered = await evaluateWatchlistAlerts([item], [snap('T1', 105)], NOW)

    expect(item.alerts[0]!.status).toBe('armed')
    expect(item.save).not.toHaveBeenCalled()
    expect(triggered).toHaveLength(0)
  })

  it('fires an above alert when LTP reaches the target, not below it', async () => {
    const hit = makeItem(
      [makeAlert({ targetPrice: 100, direction: 'above' })],
      vi.fn().mockResolvedValue(undefined),
      'T1',
    )
    const miss = makeItem(
      [makeAlert({ targetPrice: 100, direction: 'above' })],
      vi.fn().mockResolvedValue(undefined),
      'T2',
    )

    const triggered = await evaluateWatchlistAlerts(
      [hit, miss],
      [snap('T1', 100), snap('T2', 95)],
      NOW,
    )

    expect(hit.alerts[0]!.status).toBe('triggered')
    expect(miss.alerts[0]!.status).toBe('armed')
    expect(triggered).toHaveLength(1)
    expect(triggered[0]!.instrumentToken).toBe('T1')
  })

  it('ignores non-armed alerts (snoozed / disabled / already triggered)', async () => {
    const item = makeItem([
      makeAlert({ _id: 's', status: 'snoozed', targetPrice: 100 }),
      makeAlert({ _id: 'd', status: 'disabled', targetPrice: 100 }),
      makeAlert({ _id: 't', status: 'triggered', targetPrice: 100 }),
    ])
    const triggered = await evaluateWatchlistAlerts([item], [snap('T1', 90)], NOW)

    expect(triggered).toHaveLength(0)
    expect(item.save).not.toHaveBeenCalled()
    expect(item.alerts.map((a) => a.status)).toEqual([
      'snoozed',
      'disabled',
      'triggered',
    ])
  })

  it('fires once: a triggered alert does not re-fire on a later cycle', async () => {
    const item = makeItem([makeAlert({ targetPrice: 100, direction: 'below' })])
    await evaluateWatchlistAlerts([item], [snap('T1', 100)], NOW)
    const saveCalls = (item.save as ReturnType<typeof vi.fn>).mock.calls.length

    const again = await evaluateWatchlistAlerts([item], [snap('T1', 95)], NOW)
    expect(again).toHaveLength(0)
    expect((item.save as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      saveCalls,
    )
  })

  it('skips items with no snapshot', async () => {
    const item = makeItem([makeAlert({ targetPrice: 100 })])
    const triggered = await evaluateWatchlistAlerts([item], [], NOW)
    expect(triggered).toHaveLength(0)
    expect(item.save).not.toHaveBeenCalled()
  })

  it('excludes an item from the result if its save fails, and keeps evaluating others', async () => {
    const failing = makeItem(
      [makeAlert({ targetPrice: 100, direction: 'below' })],
      vi.fn().mockRejectedValue(new Error('write failed')),
      'T1',
    )
    const ok = makeItem(
      [makeAlert({ targetPrice: 50, direction: 'below' })],
      vi.fn().mockResolvedValue(undefined),
      'T2',
    )

    const triggered = await evaluateWatchlistAlerts(
      [failing, ok],
      [snap('T1', 100), snap('T2', 50)],
      NOW,
    )

    // Only the successfully-persisted item is returned for emailing.
    expect(triggered).toHaveLength(1)
    expect(triggered[0]!.instrumentToken).toBe('T2')
  })

  it('saves once for an item with multiple hits and returns all triggers', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const item = makeItem(
      [
        makeAlert({ _id: 'a1', targetPrice: 100, direction: 'below' }),
        makeAlert({ _id: 'a2', targetPrice: 110, direction: 'below' }),
      ],
      save,
    )
    const triggered = await evaluateWatchlistAlerts([item], [snap('T1', 99)], NOW)

    expect(save).toHaveBeenCalledTimes(1)
    expect(triggered).toHaveLength(2)
    expect(triggered.map((t) => t.alertId).sort()).toEqual(['a1', 'a2'])
  })
})

function indicators(
  token: string,
  partial: Partial<IndicatorSnapshotData>,
): Map<string, IndicatorSnapshotData> {
  return new Map([
    [
      token,
      {
        token,
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
      },
    ],
  ])
}

describe('evaluateWatchlistAlerts — advanced conditions', () => {
  it('carries the condition type and trigger value on the triggered alert', async () => {
    const item = makeItem([
      makeAlert({
        _id: 'v',
        type: 'volume',
        targetPrice: undefined,
        config: { mode: 'spike', multiple: 2 },
      }),
    ])
    const snapshot: PriceSnapshotData = {
      token: 'T1',
      ltp: 50,
      tradeVolume: 3_000_000,
      fetchedAt: NOW,
    }
    const triggered = await evaluateWatchlistAlerts(
      [item],
      [snapshot],
      NOW,
      'watchlist',
      indicators('T1', { avgVolume20d: 1_000_000 }),
    )

    expect(item.alerts[0]!.status).toBe('triggered')
    expect(triggered).toHaveLength(1)
    expect(triggered[0]).toMatchObject({
      type: 'volume',
      triggerValue: 3_000_000,
    })
  })

  it('fires an sma_cross using the indicator line', async () => {
    const item = makeItem([
      makeAlert({
        _id: 's',
        type: 'sma_cross',
        targetPrice: undefined,
        direction: 'below',
        config: { period: 20 },
      }),
    ])
    const triggered = await evaluateWatchlistAlerts(
      [item],
      [snap('T1', 95)],
      NOW,
      'watchlist',
      indicators('T1', { sma: { '20': 100 } }),
    )
    expect(triggered).toHaveLength(1)
    expect(triggered[0]!.triggerValue).toBe(100)
  })

  it('skips an indicator alert when no indicator snapshot is available', async () => {
    const item = makeItem([
      makeAlert({
        _id: 'r',
        type: 'rsi',
        targetPrice: undefined,
        config: { rsiBand: 'overbought' },
      }),
    ])
    // Empty indicators map — nothing to compare against, so it must not fire.
    const triggered = await evaluateWatchlistAlerts([item], [snap('T1', 100)], NOW)
    expect(triggered).toHaveLength(0)
    expect(item.save).not.toHaveBeenCalled()
  })
})
