import { describe, it, expect } from 'vitest'

import {
  applyWatchlistFilters,
  DEFAULT_FILTERS,
  filtersFromSearchParams,
  filtersToSearchParams,
  type WatchlistFilterState,
} from '@/lib/watchlist/filter'
import type { WatchlistItemView } from '@/lib/watchlist/types'

function makeView(partial: Partial<WatchlistItemView>): WatchlistItemView {
  return {
    _id: partial.instrumentToken ?? 'id',
    instrumentToken: 'T',
    instrumentSymbol: 'SYM-EQ',
    exchange: 'NSE',
    name: '',
    tags: [],
    notes: '',
    targetBuyPrice: null,
    priceWhenAdded: null,
    conviction: 'watching',
    alerts: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: null,
    ltp: null,
    dayChangePct: null,
    distanceToTargetPct: null,
    snapshotFetchedAt: null,
    armedCount: 0,
    triggeredCount: 0,
    sector: 'Other',
    inPortfolio: false,
    inStrategy: false,
    ...partial,
  }
}

const filters = (over: Partial<WatchlistFilterState> = {}): WatchlistFilterState => ({
  ...DEFAULT_FILTERS,
  tags: [],
  ...over,
})

describe('applyWatchlistFilters — filtering', () => {
  it('text search matches symbol or name (case-insensitive)', () => {
    const items = [
      makeView({ instrumentToken: 'A', instrumentSymbol: 'RELIANCE-EQ' }),
      makeView({ instrumentToken: 'B', instrumentSymbol: 'TCS-EQ', name: 'Tata' }),
    ]
    expect(
      applyWatchlistFilters(items, filters({ search: 'reli' })).map(
        (i) => i.instrumentToken,
      ),
    ).toEqual(['A'])
    expect(
      applyWatchlistFilters(items, filters({ search: 'tata' })).map(
        (i) => i.instrumentToken,
      ),
    ).toEqual(['B'])
  })

  it('tag filter supports OR and AND modes', () => {
    const items = [
      makeView({ instrumentToken: 'A', tags: ['swing'] }),
      makeView({ instrumentToken: 'B', tags: ['swing', 'high conviction'] }),
    ]
    expect(
      applyWatchlistFilters(items, filters({ tags: ['swing'], tagMode: 'or' })).length,
    ).toBe(2)
    expect(
      applyWatchlistFilters(
        items,
        filters({ tags: ['swing', 'high conviction'], tagMode: 'and' }),
      ).map((i) => i.instrumentToken),
    ).toEqual(['B'])
  })

  it('filters by exchange, sector, and conviction', () => {
    const items = [
      makeView({ instrumentToken: 'A', exchange: 'NSE', sector: 'Banking', conviction: 'high' }),
      makeView({ instrumentToken: 'B', exchange: 'BSE', sector: 'Pharma', conviction: 'watching' }),
    ]
    expect(applyWatchlistFilters(items, filters({ exchange: 'BSE' })).map((i) => i.instrumentToken)).toEqual(['B'])
    expect(applyWatchlistFilters(items, filters({ sector: 'Banking' })).map((i) => i.instrumentToken)).toEqual(['A'])
    expect(applyWatchlistFilters(items, filters({ conviction: 'high' })).map((i) => i.instrumentToken)).toEqual(['A'])
  })

  it('filters by alert status', () => {
    const items = [
      makeView({ instrumentToken: 'armed', armedCount: 1, alerts: [{ _id: 'x', targetPrice: 1, direction: 'below', status: 'armed', lastTriggeredAt: null, lastTriggeredPrice: null, note: '' }] }),
      makeView({ instrumentToken: 'trig', triggeredCount: 1, alerts: [{ _id: 'y', targetPrice: 1, direction: 'below', status: 'triggered', lastTriggeredAt: null, lastTriggeredPrice: null, note: '' }] }),
      makeView({ instrumentToken: 'none', alerts: [] }),
    ]
    expect(applyWatchlistFilters(items, filters({ alertStatus: 'armed' })).map((i) => i.instrumentToken)).toEqual(['armed'])
    expect(applyWatchlistFilters(items, filters({ alertStatus: 'triggered' })).map((i) => i.instrumentToken)).toEqual(['trig'])
    expect(applyWatchlistFilters(items, filters({ alertStatus: 'none' })).map((i) => i.instrumentToken)).toEqual(['none'])
  })

  it('near-target keeps only items within the threshold', () => {
    const items = [
      makeView({ instrumentToken: 'close', distanceToTargetPct: -2 }),
      makeView({ instrumentToken: 'far', distanceToTargetPct: -20 }),
      makeView({ instrumentToken: 'none', distanceToTargetPct: null }),
    ]
    expect(
      applyWatchlistFilters(items, filters({ nearTarget: true, nearTargetPct: 5 })).map(
        (i) => i.instrumentToken,
      ),
    ).toEqual(['close'])
  })

  it('hide-in-portfolio and hide-in-strategy exclude flagged items', () => {
    const items = [
      makeView({ instrumentToken: 'pf', inPortfolio: true }),
      makeView({ instrumentToken: 'st', inStrategy: true }),
      makeView({ instrumentToken: 'plain' }),
    ]
    expect(applyWatchlistFilters(items, filters({ hideInPortfolio: true })).map((i) => i.instrumentToken)).toEqual(['st', 'plain'])
    expect(applyWatchlistFilters(items, filters({ hideInStrategy: true })).map((i) => i.instrumentToken)).toEqual(['pf', 'plain'])
  })
})

describe('applyWatchlistFilters — sorting', () => {
  it('sorts by symbol ascending', () => {
    const items = [
      makeView({ instrumentToken: 'B', instrumentSymbol: 'ZEE-EQ' }),
      makeView({ instrumentToken: 'A', instrumentSymbol: 'ABB-EQ' }),
    ]
    expect(
      applyWatchlistFilters(items, filters({ sortKey: 'symbol', sortDir: 'asc' })).map(
        (i) => i.instrumentSymbol,
      ),
    ).toEqual(['ABB-EQ', 'ZEE-EQ'])
  })

  it('sorts by day change descending, nulls last', () => {
    const items = [
      makeView({ instrumentToken: 'mid', dayChangePct: 1 }),
      makeView({ instrumentToken: 'top', dayChangePct: 5 }),
      makeView({ instrumentToken: 'nul', dayChangePct: null }),
    ]
    expect(
      applyWatchlistFilters(items, filters({ sortKey: 'dayChange', sortDir: 'desc' })).map(
        (i) => i.instrumentToken,
      ),
    ).toEqual(['top', 'mid', 'nul'])
  })

  it('sorts by absolute distance to target ascending (closest first)', () => {
    const items = [
      makeView({ instrumentToken: 'far', distanceToTargetPct: -20 }),
      makeView({ instrumentToken: 'near', distanceToTargetPct: 3 }),
    ]
    expect(
      applyWatchlistFilters(items, filters({ sortKey: 'distance', sortDir: 'asc' })).map(
        (i) => i.instrumentToken,
      ),
    ).toEqual(['near', 'far'])
  })

  it('sorts by conviction descending (high first)', () => {
    const items = [
      makeView({ instrumentToken: 'w', conviction: 'watching' }),
      makeView({ instrumentToken: 'h', conviction: 'high' }),
      makeView({ instrumentToken: 'i', conviction: 'interested' }),
    ]
    expect(
      applyWatchlistFilters(items, filters({ sortKey: 'conviction', sortDir: 'desc' })).map(
        (i) => i.instrumentToken,
      ),
    ).toEqual(['h', 'i', 'w'])
  })

  it('sorts by recently added descending', () => {
    const items = [
      makeView({ instrumentToken: 'old', createdAt: '2024-01-01T00:00:00.000Z' }),
      makeView({ instrumentToken: 'new', createdAt: '2024-03-01T00:00:00.000Z' }),
    ]
    expect(
      applyWatchlistFilters(items, filters({ sortKey: 'recentlyAdded', sortDir: 'desc' })).map(
        (i) => i.instrumentToken,
      ),
    ).toEqual(['new', 'old'])
  })

  it('sorts by recently triggered descending', () => {
    const items = [
      makeView({
        instrumentToken: 'early',
        alerts: [{ _id: 'a', targetPrice: 1, direction: 'below', status: 'triggered', lastTriggeredAt: '2024-02-01T00:00:00.000Z', lastTriggeredPrice: 1, note: '' }],
      }),
      makeView({
        instrumentToken: 'late',
        alerts: [{ _id: 'b', targetPrice: 1, direction: 'below', status: 'triggered', lastTriggeredAt: '2024-05-01T00:00:00.000Z', lastTriggeredPrice: 1, note: '' }],
      }),
    ]
    expect(
      applyWatchlistFilters(items, filters({ sortKey: 'recentlyTriggered', sortDir: 'desc' })).map(
        (i) => i.instrumentToken,
      ),
    ).toEqual(['late', 'early'])
  })
})

describe('filter URL round-trip', () => {
  it('serializes non-default values and parses them back', () => {
    const state = filters({
      search: 'reliance',
      tags: ['swing', 'high conviction'],
      tagMode: 'and',
      exchange: 'BSE',
      sector: 'Banking',
      conviction: 'high',
      alertStatus: 'armed',
      nearTarget: true,
      nearTargetPct: 3,
      hideInPortfolio: true,
      sortKey: 'distance',
      sortDir: 'asc',
    })
    const params = filtersToSearchParams(state)
    const parsed = filtersFromSearchParams(new URLSearchParams(params.toString()))
    expect(parsed).toEqual(state)
  })

  it('omits defaults from the query string', () => {
    const params = filtersToSearchParams(filters())
    expect(params.toString()).toBe('')
  })
})
