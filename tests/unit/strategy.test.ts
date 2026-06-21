import { describe, it, expect, vi } from 'vitest'
import {
  evaluateEntries,
  resolveTriggerType,
  entryTriggered,
  type EvaluatableEntry,
} from '@/lib/strategy/evaluate'
import { computeGroupStats } from '@/lib/strategy/group'
import { strategyEntrySchema } from '@/lib/validation/schemas'
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
    quantity: 10,
    soldQuantity: 0,
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

  it('stop (breakout) entry stays pending while price is below entry', async () => {
    // Regression: the price sits below a breakout entry. It must NOT fill — the
    // old logic filled any pending entry as soon as ltp <= entryPrice.
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
      triggerType: 'stop',
    })
    await evaluateEntries([entry], [snap('T1', 95)])
    expect(entry.status).toBe('pending')
    expect(entry.events).toHaveLength(0)
    expect(entry.save).not.toHaveBeenCalled()
  })

  it('stop (breakout) entry fills when price rises to entry', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
      triggerType: 'stop',
    })
    const out = await evaluateEntries([entry], [snap('T1', 100)])
    expect(entry.status).toBe('active')
    expect(entry.events.at(-1)?.type).toBe('entry_hit')
    expect(out.transitioned).toBe(1)
  })

  it('limit (dip) entry fills when price falls to entry', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
      triggerType: 'limit',
    })
    await evaluateEntries([entry], [snap('T1', 99)])
    expect(entry.status).toBe('active')
    expect(entry.events.at(-1)?.type).toBe('entry_hit')
  })

  it('pending → expired after 10 trading days without triggering', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
      triggerType: 'limit',
      // Created Mon 2024-06-03 IST; evaluated Mon 2024-06-17 IST = 10 trading days.
      createdAt: new Date('2024-06-03T05:30:00Z'),
    })
    const now = new Date('2024-06-17T05:30:00Z')
    // LTP 105 is above a dip-buy entry, so it never filled.
    const out = await evaluateEntries([entry], [snap('T1', 105)], now)
    expect(entry.status).toBe('expired')
    expect(entry.events.at(-1)?.type).toBe('expired')
    expect(entry.events.at(-1)?.price).toBe(105)
    expect(entry.save).toHaveBeenCalledTimes(1)
    expect(out.transitioned).toBe(1)
  })

  it('pending stays pending before 10 trading days elapse', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
      triggerType: 'limit',
      createdAt: new Date('2024-06-03T05:30:00Z'),
    })
    // Fri 2024-06-14 IST = only 9 trading days since creation.
    const now = new Date('2024-06-14T05:30:00Z')
    await evaluateEntries([entry], [snap('T1', 105)], now)
    expect(entry.status).toBe('pending')
    expect(entry.events).toHaveLength(0)
    expect(entry.save).not.toHaveBeenCalled()
  })

  it('a triggered entry fills rather than expiring, even when old', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
      triggerType: 'limit',
      createdAt: new Date('2024-06-03T05:30:00Z'),
    })
    const now = new Date('2024-06-17T05:30:00Z')
    // LTP 99 meets the dip-buy trigger: it fills (entry_hit), not expires.
    await evaluateEntries([entry], [snap('T1', 99)], now)
    expect(entry.status).toBe('active')
    expect(entry.events.at(-1)?.type).toBe('entry_hit')
  })

  it('without createdAt a pending entry never auto-expires', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
      triggerType: 'limit',
    })
    const now = new Date('2024-06-17T05:30:00Z')
    await evaluateEntries([entry], [snap('T1', 105)], now)
    expect(entry.status).toBe('pending')
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

  it('unassigned entry (no instrument) is never evaluated, even when old', async () => {
    // An entry saved with just the levels has an empty token: no snapshot can
    // match it, so it stays pending and untracked until a stock is assigned.
    const entry = makeEntry({
      instrumentToken: '',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      status: 'pending',
      triggerType: 'limit',
      createdAt: new Date('2024-06-03T05:30:00Z'),
    })
    const now = new Date('2024-06-17T05:30:00Z') // well past the expiry window
    const out = await evaluateEntries([entry], [snap('T1', 95)], now)
    expect(entry.status).toBe('pending')
    expect(entry.events).toHaveLength(0)
    expect(entry.save).not.toHaveBeenCalled()
    expect(out.evaluated).toBe(0)
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

  it('single share (trail mode): TP1 starts trailing instead of selling', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      quantity: 1,
      status: 'active',
    })
    await evaluateEntries([entry], [snap('T1', 110)])
    expect(entry.status).toBe('trailing')
    expect(entry.peakPrice).toBe(110)
    expect(entry.soldQuantity).toBe(0)
    expect(entry.events.at(-1)?.type).toBe('tp1_hit')
  })

  it('trailing: stop ratchets with the high, never below breakeven', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90, // risk = 10
      targetPrice: 110,
      quantity: 1,
      status: 'trailing',
      peakPrice: 110,
    })
    // New high 130 -> stop = max(100, 130-10) = 120. LTP 130 stays in.
    await evaluateEntries([entry], [snap('T1', 130)])
    expect(entry.status).toBe('trailing')
    expect(entry.peakPrice).toBe(130)

    // Pulls back to 119 (<= 120 stop) -> trailing stop hit, full exit.
    await evaluateEntries([entry], [snap('T1', 119)])
    expect(entry.status).toBe('trail_hit')
    expect(entry.soldQuantity).toBe(1)
    expect(entry.events.at(-1)?.type).toBe('trail_hit')
    expect(entry.events.at(-1)?.quantity).toBe(1)
  })

  it('trailing with TP2: hard-exits at the second target', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      target2: 125,
      quantity: 1,
      status: 'trailing',
      peakPrice: 110,
    })
    await evaluateEntries([entry], [snap('T1', 125)])
    expect(entry.status).toBe('tp_hit')
    expect(entry.soldQuantity).toBe(1)
  })

  it('scale mode: TP1 sells half and rides the rest to partial', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      target2: 120,
      quantity: 4,
      status: 'active',
    })
    await evaluateEntries([entry], [snap('T1', 110)])
    expect(entry.status).toBe('partial')
    expect(entry.soldQuantity).toBe(2)
    expect(entry.events.at(-1)?.type).toBe('tp1_partial')
    expect(entry.events.at(-1)?.quantity).toBe(2)
  })

  it('scale mode: partial exits remainder at TP2', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      target2: 120,
      quantity: 4,
      soldQuantity: 2,
      status: 'partial',
    })
    await evaluateEntries([entry], [snap('T1', 120)])
    expect(entry.status).toBe('tp_hit')
    expect(entry.soldQuantity).toBe(4)
    expect(entry.events.at(-1)?.quantity).toBe(2)
  })

  it('scale mode: remainder trails up after TP1 and exits on pullback', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90, // risk = 10
      targetPrice: 110,
      target2: 200, // far away so the trail (not TP2) decides the exit
      quantity: 4,
      soldQuantity: 2,
      peakPrice: 110,
      status: 'partial',
    })
    // New high 130 -> stop = max(100, 130-10) = 120. LTP 130 stays in.
    await evaluateEntries([entry], [snap('T1', 130)])
    expect(entry.status).toBe('partial')
    expect(entry.peakPrice).toBe(130)

    // Pulls back to 119 (<= 120) -> remainder trailed out, full position closed.
    await evaluateEntries([entry], [snap('T1', 119)])
    expect(entry.status).toBe('trail_hit')
    expect(entry.soldQuantity).toBe(4)
    expect(entry.events.at(-1)?.quantity).toBe(2)
  })

  it('scale mode: remainder exits at breakeven if it never makes a new high', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      target2: 120,
      quantity: 4,
      soldQuantity: 2,
      peakPrice: 110,
      status: 'partial',
    })
    await evaluateEntries([entry], [snap('T1', 100)])
    expect(entry.status).toBe('trail_hit')
    expect(entry.soldQuantity).toBe(4)
  })

  it('multi-share without TP2 fully exits at TP1', async () => {
    const entry = makeEntry({
      instrumentToken: 'T1',
      entryPrice: 100,
      stopLoss: 90,
      targetPrice: 110,
      quantity: 4,
      status: 'active',
    })
    await evaluateEntries([entry], [snap('T1', 110)])
    expect(entry.status).toBe('tp_hit')
    expect(entry.soldQuantity).toBe(4)
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

  it('an expired entry frees its capital and is not a win or loss', () => {
    const stats = computeGroupStats(
      { allocatedCapital: 10000 },
      [
        // active: 10 * 100 = 1000 deployed
        {
          instrumentToken: 'T1',
          entryPrice: 100,
          stopLoss: 90,
          targetPrice: 120,
          quantity: 10,
          status: 'active' as const,
        },
        // expired: never filled → no capital deployed, excluded from win rate
        {
          instrumentToken: 'T2',
          entryPrice: 200,
          stopLoss: 180,
          targetPrice: 240,
          quantity: 5,
          status: 'expired' as const,
          events: [{ type: 'expired', price: 210, timestamp: new Date() }],
        },
        // one win so the rate is well-defined
        {
          instrumentToken: 'T3',
          entryPrice: 50,
          stopLoss: 45,
          targetPrice: 60,
          quantity: 4,
          status: 'tp_hit' as const,
        },
      ],
      [snap('T1', 105)],
    )

    // Only the active entry deploys capital; the expired one freed its ₹1000.
    expect(stats.capitalDeployed).toBe(1000)
    expect(stats.capitalFree).toBe(9000)
    expect(stats.entryCountByStatus.expired).toBe(1)
    // 1 win, 0 losses (expired is neither) → 100%.
    expect(stats.winRate).toBe(1)
    const expired = stats.entries.find((e) => e.instrumentToken === 'T2')!
    expect(expired.unrealizedPnL).toBe(0)
    expect(expired.realizedPnL).toBe(0)
  })

  it('an unassigned entry still reserves capital and shows no current price', () => {
    const stats = computeGroupStats(
      { allocatedCapital: 10000 },
      [
        {
          _id: 'e1',
          instrumentToken: '', // no stock assigned yet
          entryPrice: 100,
          stopLoss: 90,
          targetPrice: 120,
          quantity: 10,
          status: 'pending' as const,
        },
      ],
      [snap('T1', 105)],
    )

    // Capital is reserved off the planned levels even with no stock.
    expect(stats.capitalDeployed).toBe(1000)
    expect(stats.capitalFree).toBe(9000)
    const entry = stats.entries[0]!
    expect(entry.instrumentSymbol).toBe('')
    expect(entry.currentPrice).toBeNull()
    expect(entry.risk).toBe(100)
    expect(entry.reward).toBe(200)
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

describe('resolveTriggerType', () => {

  it('auto picks stop when entry is at or above the current price', () => {

    expect(resolveTriggerType('auto', 100, 95)).toBe('stop')

    expect(resolveTriggerType('auto', 100, 100)).toBe('stop')

  })



  it('auto picks limit when entry is below the current price', () => {

    expect(resolveTriggerType('auto', 100, 105)).toBe('limit')

  })



  it('auto falls back to limit when no reference price is known', () => {

    expect(resolveTriggerType('auto', 100, null)).toBe('limit')

  })



  it('an explicit choice is honoured regardless of reference price', () => {

    expect(resolveTriggerType('stop', 100, 105)).toBe('stop')

    expect(resolveTriggerType('limit', 100, 95)).toBe('limit')

  })

})



describe('entryTriggered', () => {

  it('stop fills on the way up, limit on the way down', () => {

    expect(entryTriggered('stop', 100, 100)).toBe(true)

    expect(entryTriggered('stop', 100, 99)).toBe(false)

    expect(entryTriggered('limit', 100, 100)).toBe(true)

    expect(entryTriggered('limit', 100, 101)).toBe(false)

  })



  it('treats a missing trigger type as limit (legacy behaviour)', () => {

    expect(entryTriggered(undefined, 100, 99)).toBe(true)

    expect(entryTriggered(undefined, 100, 101)).toBe(false)

  })

})

describe('strategyEntrySchema — optional instrument', () => {
  const base = {
    groupId: 'grp1',
    entryPrice: 100,
    stopLoss: 90,
    targetPrice: 120,
    quantity: 10,
  }

  it('accepts an entry with no instrument (levels only)', () => {
    const result = strategyEntrySchema.safeParse(base)
    expect(result.success).toBe(true)
  })

  it('accepts an entry with an instrument', () => {
    const result = strategyEntrySchema.safeParse({
      ...base,
      instrumentToken: 'T1',
      instrumentSymbol: 'SBIN-EQ',
    })
    expect(result.success).toBe(true)
  })

  it('rejects "already entered" without an instrument', () => {
    const result = strategyEntrySchema.safeParse({
      ...base,
      triggerType: 'active',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes('instrumentToken')),
      ).toBe(true)
    }
  })

  it('allows "already entered" when an instrument is given', () => {
    const result = strategyEntrySchema.safeParse({
      ...base,
      triggerType: 'active',
      instrumentToken: 'T1',
      instrumentSymbol: 'SBIN-EQ',
    })
    expect(result.success).toBe(true)
  })
})
