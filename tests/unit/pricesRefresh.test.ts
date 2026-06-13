import { describe, it, expect, vi, beforeEach } from 'vitest'

import { AuthError, RateLimitError } from '@/lib/angelone/errors'
import type { PriceSnapshotData, ExchangeTokens } from '@/lib/angelone/quotes'

// ----- Mocks --------------------------------------------------------------
// vi.mock is hoisted, so these run before any of the imports below.

vi.mock('@/lib/db/connect', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/db/models/Instrument', () => ({
  Instrument: { find: vi.fn() },
}))

vi.mock('@/lib/db/models/PriceSnapshot', () => ({
  PriceSnapshot: { bulkWrite: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/lib/db/models/StrategyEntry', () => ({
  StrategyEntry: { find: vi.fn() },
}))

vi.mock('@/lib/db/models/Transaction', () => ({
  Transaction: { aggregate: vi.fn() },
}))

vi.mock('@/lib/db/models/WatchlistItem', () => ({
  WatchlistItem: { find: vi.fn() },
}))

vi.mock('@/lib/watchlist/evaluate', () => ({
  evaluateWatchlistAlerts: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/email/mailer', () => ({
  sendWatchlistAlertEmail: vi.fn().mockResolvedValue({ sent: true }),
}))

vi.mock('@/lib/angelone/quotes', () => ({
  getQuotes: vi.fn(),
}))

vi.mock('@/lib/angelone/session', () => ({
  getValidSession: vi
    .fn()
    .mockResolvedValue({ jwtToken: 'jwt', feedToken: 'feed' }),
  invalidateSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/strategy/evaluate', () => ({
  evaluateEntries: vi
    .fn()
    .mockResolvedValue({ evaluated: 0, transitioned: 0 }),
  OPEN_ENTRY_STATUSES: ['pending', 'active', 'partial', 'trailing'],
}))

// ----- Imports (after vi.mock so they pick up the mocks) ------------------
import { runRefreshCycle } from '@/lib/prices/refresh'
import { Instrument } from '@/lib/db/models/Instrument'
import { PriceSnapshot } from '@/lib/db/models/PriceSnapshot'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { Transaction } from '@/lib/db/models/Transaction'
import { WatchlistItem } from '@/lib/db/models/WatchlistItem'
import { getQuotes } from '@/lib/angelone/quotes'
import { getValidSession, invalidateSession } from '@/lib/angelone/session'
import { evaluateEntries } from '@/lib/strategy/evaluate'

// ----- Helpers ------------------------------------------------------------

type AggregateRow = { _id: string; netQty: number }
type StrategyTokenRow = { instrumentToken: string }
type InstrumentRow = { token: string; exchange: string }

const aggregateMock = Transaction.aggregate as unknown as ReturnType<typeof vi.fn>
const strategyFindMock = StrategyEntry.find as unknown as ReturnType<typeof vi.fn>
const instrumentFindMock = Instrument.find as unknown as ReturnType<typeof vi.fn>
const watchlistFindMock = WatchlistItem.find as unknown as ReturnType<typeof vi.fn>
const bulkWriteMock = PriceSnapshot.bulkWrite as unknown as ReturnType<typeof vi.fn>
const invalidateSessionMock = invalidateSession as unknown as ReturnType<typeof vi.fn>
const getQuotesMock = getQuotes as unknown as ReturnType<typeof vi.fn>
const getValidSessionMock = getValidSession as unknown as ReturnType<typeof vi.fn>
const evaluateMock = evaluateEntries as unknown as ReturnType<typeof vi.fn>

function leanReturn<T>(docs: T[]) {
  return { lean: vi.fn().mockResolvedValue(docs) }
}

function configureStrategyFind(opts: {
  tokenRows: StrategyTokenRow[]
  evaluatableDocs: unknown[]
}) {
  strategyFindMock.mockImplementation((_filter: unknown, projection?: unknown) => {
    if (projection) {
      // collectStrategyTokens: find(filter, { instrumentToken: 1, _id: 0 }).lean()
      return leanReturn(opts.tokenRows)
    }
    // fetchEvaluatableEntries: find(filter) — awaited directly
    return Promise.resolve(opts.evaluatableDocs)
  })
}

function configureAggregate(rows: AggregateRow[]) {
  aggregateMock.mockResolvedValue(rows)
}

function configureInstrumentFind(rows: InstrumentRow[]) {
  instrumentFindMock.mockReturnValue(leanReturn(rows))
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset default resolved values that vi.clearAllMocks() blew away.
  bulkWriteMock.mockResolvedValue(undefined)
  invalidateSessionMock.mockResolvedValue(undefined)
  getValidSessionMock.mockResolvedValue({ jwtToken: 'jwt', feedToken: 'feed' })
  evaluateMock.mockResolvedValue({ evaluated: 0, transitioned: 0 })
  // No watchlist alerts by default: token-collection (projected, .lean()) and
  // the hydrated fetch (awaited directly) both return empty.
  watchlistFindMock.mockImplementation((_filter: unknown, projection?: unknown) =>
    projection ? leanReturn([]) : Promise.resolve([]),
  )
})

// ----- Tests --------------------------------------------------------------

describe('runRefreshCycle', () => {
  it('returns { skipped: true, reason: "no tokens" } when no holdings or entries exist', async () => {
    configureAggregate([])
    configureStrategyFind({ tokenRows: [], evaluatableDocs: [] })

    const result = await runRefreshCycle()

    expect(result).toMatchObject({ skipped: true, reason: 'no tokens' })
    expect(getQuotesMock).not.toHaveBeenCalled()
    expect(bulkWriteMock).not.toHaveBeenCalled()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('runs a successful cycle: fetches quotes with exchange-grouped tokens, upserts snapshots, evaluates entries', async () => {
    configureAggregate([{ _id: 'T1', netQty: 10 }])
    configureStrategyFind({
      tokenRows: [{ instrumentToken: 'T2' }],
      evaluatableDocs: [{ instrumentToken: 'T2' /* mock entry doc */ }],
    })
    configureInstrumentFind([
      { token: 'T1', exchange: 'NSE' },
      { token: 'T2', exchange: 'BSE' },
    ])

    const fetchedAt = new Date('2024-06-01T10:00:00Z')
    const snapshots: PriceSnapshotData[] = [
      { token: 'T1', ltp: 100, fetchedAt },
      { token: 'T2', ltp: 200, fetchedAt },
    ]
    getQuotesMock.mockResolvedValue(snapshots)
    evaluateMock.mockResolvedValue({ evaluated: 1, transitioned: 0 })

    const result = await runRefreshCycle()

    expect(getQuotesMock).toHaveBeenCalledTimes(1)
    const [grouped, mode] = getQuotesMock.mock.calls[0]! as [ExchangeTokens, string]
    expect(mode).toBe('FULL')
    expect(grouped.NSE).toEqual(['T1'])
    expect(grouped.BSE).toEqual(['T2'])

    expect(bulkWriteMock).toHaveBeenCalledTimes(1)
    const bulkOps = bulkWriteMock.mock.calls[0]![0] as Array<{
      updateOne: { filter: { token: string }; upsert: boolean }
    }>
    expect(bulkOps).toHaveLength(2)
    expect(bulkOps.map((op) => op.updateOne.filter.token).sort()).toEqual([
      'T1',
      'T2',
    ])
    expect(bulkOps.every((op) => op.updateOne.upsert === true)).toBe(true)

    expect(evaluateMock).toHaveBeenCalledTimes(1)

    expect(result).toMatchObject({
      skipped: false,
      fetched: 2,
      evaluated: 1,
      transitioned: 0,
    })
  })

  it('returns { skipped: true, reason: "rate_limited" } when getQuotes throws RateLimitError, without calling evaluateEntries or bulkWrite', async () => {
    configureAggregate([{ _id: 'T1', netQty: 10 }])
    configureStrategyFind({ tokenRows: [], evaluatableDocs: [] })
    configureInstrumentFind([{ token: 'T1', exchange: 'NSE' }])
    getQuotesMock.mockRejectedValue(new RateLimitError('rate limited'))

    const result = await runRefreshCycle()

    expect(result).toMatchObject({ skipped: true, reason: 'rate_limited' })
    expect(bulkWriteMock).not.toHaveBeenCalled()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('on AuthError, invalidates the session and re-authenticates once before retrying getQuotes', async () => {
    configureAggregate([{ _id: 'T1', netQty: 10 }])
    configureStrategyFind({ tokenRows: [], evaluatableDocs: [] })
    configureInstrumentFind([{ token: 'T1', exchange: 'NSE' }])

    const fetchedAt = new Date('2024-06-01T10:00:00Z')
    const finalSnapshots: PriceSnapshotData[] = [
      { token: 'T1', ltp: 101, fetchedAt },
    ]
    getQuotesMock
      .mockRejectedValueOnce(new AuthError('jwt expired'))
      .mockResolvedValueOnce(finalSnapshots)

    const result = await runRefreshCycle()

    expect(getValidSessionMock).toHaveBeenCalledTimes(2) // initial + re-auth
    expect(invalidateSessionMock).toHaveBeenCalledTimes(1) // session invalidated once
    expect(getQuotesMock).toHaveBeenCalledTimes(2) // failed call + retry
    expect(bulkWriteMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ skipped: false, fetched: 1 })
  })

  it('returns { skipped: true, reason: "error" } when getQuotes throws a non-rate-limit, non-auth error', async () => {
    configureAggregate([{ _id: 'T1', netQty: 10 }])
    configureStrategyFind({ tokenRows: [], evaluatableDocs: [] })
    configureInstrumentFind([{ token: 'T1', exchange: 'NSE' }])
    getQuotesMock.mockRejectedValue(new Error('boom'))

    const result = await runRefreshCycle()

    expect(result).toMatchObject({ skipped: true, reason: 'error' })
    expect(bulkWriteMock).not.toHaveBeenCalled()
    expect(evaluateMock).not.toHaveBeenCalled()
  })

  it('returns { skipped: true, reason: "no tokens" } when tokens exist but no matching Instrument documents resolve to an exchange', async () => {
    configureAggregate([{ _id: 'UNKNOWN', netQty: 5 }])
    configureStrategyFind({ tokenRows: [], evaluatableDocs: [] })
    configureInstrumentFind([]) // no matching instruments

    const result = await runRefreshCycle()

    expect(result).toMatchObject({ skipped: true, reason: 'no tokens' })
    expect(getQuotesMock).not.toHaveBeenCalled()
  })
})
