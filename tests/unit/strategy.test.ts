import { describe, it, expect, vi } from 'vitest'
import {
  evaluateEntries,
  type EvaluatableEntry,
} from '@/lib/strategy/evaluate'
import { computeGroupStats } from '@/lib/strategy/group'
import type { PriceSnapshotData } from '@/lib/angelone/quotes'

const snap = (token: string, ltp: number): PriceSnapshotData => ({
  token,
  ltp,
  fetchedAt: new Date('2024-06-01T10:00:00Z'),
})

function makeEntry(
  partial: Partial<EvaluatableEntry> & {
    instrumentToken: string
    entryPrice: number
    stopLoss: number
    targetPrice: number
    status: EvaluatableEntry['status']
  },
): EvaluatableEntry {
  const entry: EvaluatableEntry = {
    direction: 'long',
    events: [],
    save: vi.fn().mockResolvedValue(undefined),
    ...partial,
  }
  return entry
}

describe('evaluateEntries', () => {
  it('pending → active when LTP touches entry price', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
    })
    const out = await evaluateEntries([entry], [snap('T1', 100)])
    expect(entry.status).toBe('active')
    expect(entry.events.at(-1)?.type).toBe('entry_hit')
    expect(entry.save).toHaveBeenCalledTimes(1)
    expect(out.transitioned).toBe(1)
  })

  it('pending stays pending when LTP above entry (long not crossed yet)', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
    })
    await evaluateEntries([entry], [snap('T1', 105)])
    expect(entry.status).toBe('pending')
    expect(entry.events).toHaveLength(0)
    expect(entry.save).not.toHaveBeenCalled()
  })

  it('active → tp_hit when LTP reaches target', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'active',
    })
    await evaluateEntries([entry], [snap('T1', 110)])
    expect(entry.status).toBe('tp_hit')
    expect(entry.events.at(-1)?.type).toBe('tp_hit')
    expect(entry.save).toHaveBeenCalledTimes(1)
  })

  it('active → sl_hit when LTP at stop loss', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'active',
    })
    await evaluateEntries([entry], [snap('T1', 90)])
    expect(entry.status).toBe('sl_hit')
    expect(entry.events.at(-1)?.type).toBe('sl_hit')
  })

  it('no snapshot for token → no change', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
    })
    await evaluateEntries([entry], [])
    expect(entry.status).toBe('pending')
    expect(entry.save).not.toHaveBeenCalled()
  })

  it('TP takes precedence over SL when both could trigger', async () => {
    // Use very wide LTP that exceeds both target and sl_hit threshold
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 120, // stop loss is above entry — edge case but exercises ordering
      targetPrice: 110,
      status: 'active',
    })
    await evaluateEntries([entry], [snap('T1', 115)])
    expect(entry.status).toBe('tp_hit')
  })

  it('does not double-transition closed entries', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'tp_hit',
    })
    await evaluateEntries([entry], [snap('T1', 200)])
    expect(entry.status).toBe('tp_hit')
    expect(entry.save).not.toHaveBeenCalled()
  })
})

describe('computeGroupStats', () => {
  it('computes capital deployed/free, win rate, and R:R correctly', () => {
    const group = { allocatedCapital: 10000 }
    const entries = [
      // active entry: 10 * 100 = 1000 deployed
      {
        _id: 'e1',
        instrumentToken: 'T1',
        instrumentSymbol: 'A',
        entryPrice: 100,
        stopLoss: 90,
        targetPrice: 120,
        quantity: 10,
        status: 'active' as const,
      },
      // pending entry: 5 * 200 = 1000 deployed
      {
        _id: 'e2',
        instrumentToken: 'T2',
        instrumentSymbol: 'B',
        entryPrice: 200,
        stopLoss: 180,
        targetPrice: 240,
        quantity: 5,
        status: 'pending' as const,
      },
      // tp_hit (closed, not deployed)
      {
        _id: 'e3',
        instrumentToken: 'T3',
        instrumentSymbol: 'C',
        entryPrice: 50,
        stopLoss: 45,
        targetPrice: 60,
        quantity: 4,
        status: 'tp_hit' as const,
      },
      // sl_hit (closed, not deployed)
      {
        _id: 'e4',
        instrumentToken: 'T4',
        instrumentSymbol: 'D',
        entryPrice: 30,
        stopLoss: 25,
        targetPrice: 40,
        quantity: 2,
        status: 'sl_hit' as const,
      },
    ]
    const stats = computeGroupStats(group, entries, [snap('T1', 105)])

    expect(stats.allocatedCapital).toBe(10000)
    expect(stats.capitalDeployed).toBe(2000)
    expect(stats.capitalFree).toBe(8000)
    expect(stats.entryCountByStatus.active).toBe(1)
    expect(stats.entryCountByStatus.pending).toBe(1)
    expect(stats.entryCountByStatus.tp_hit).toBe(1)
    expect(stats.entryCountByStatus.sl_hit).toBe(1)
    // winRate = 1 / (1 + 1) = 0.5
    expect(stats.winRate).toBe(0.5)

    const first = stats.entries.find((e) => e.instrumentToken === 'T1')!
    expect(first.capitalUsed).toBe(1000)
    expect(first.risk).toBe(100) // (100-90)*10
    expect(first.reward).toBe(200) // (120-100)*10
    expect(first.rr).toBe(2)
    expect(first.unrealizedPnL).toBe(50) // (105-100)*10
  })

  it('returns winRate = 0 when no decided entries exist', () => {
    const stats = computeGroupStats(
      { allocatedCapital: 1000 },
      [
        {
          instrumentToken: 'T1',
          entryPrice: 100,
          stopLoss: 90,
          targetPrice: 110,
          quantity: 1,
          status: 'pending',
        },
      ],
      [],
    )
    expect(stats.winRate).toBe(0)
  })
})
