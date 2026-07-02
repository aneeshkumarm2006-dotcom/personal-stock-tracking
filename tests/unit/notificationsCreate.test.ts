import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the model so no DB is touched; we only assert what we'd persist.
vi.mock('@/lib/db/models/Notification', () => ({
  Notification: { create: vi.fn() },
}))

import {
  createAlertNotification,
  createExitNotification,
} from '@/lib/notifications/create'
import { Notification } from '@/lib/db/models/Notification'
import type { StrategyExit } from '@/lib/strategy/evaluate'
import type { TriggeredAlert } from '@/lib/watchlist/evaluate'

const createMock = Notification.create as unknown as ReturnType<typeof vi.fn>

type CreateArg = {
  kind: string
  severity: string
  strategyEntryId: string
  instrumentToken: string
  instrumentSymbol: string
  title: string
  body: string
  price: number
  quantity: number
}

function exit(partial: Partial<StrategyExit>): StrategyExit {
  return {
    entryId: 'e1',
    groupId: 'g1',
    instrumentToken: 'T1',
    instrumentSymbol: 'SBIN',
    kind: 'sl_hit',
    price: 90,
    quantity: 10,
    enteredToPortfolio: true,
    at: new Date('2024-06-01T10:00:00Z'),
    ...partial,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  createMock.mockResolvedValue({ _id: 'n1' })
})

describe('createExitNotification', () => {
  it('maps sl_hit to danger severity and builds a "sell" instruction', async () => {
    await createExitNotification(exit({ kind: 'sl_hit', price: 90, quantity: 10 }))
    const arg = createMock.mock.calls[0]![0] as CreateArg
    expect(arg).toMatchObject({
      kind: 'sl_hit',
      severity: 'danger',
      strategyEntryId: 'e1',
      instrumentToken: 'T1',
      quantity: 10,
      price: 90,
    })
    expect(arg.title).toContain('SBIN')
    expect(arg.body.toLowerCase()).toContain('sell')
  })

  it('maps tp_hit/trail_hit to success and tp1_partial to warning', async () => {
    await createExitNotification(exit({ kind: 'tp_hit' }))
    await createExitNotification(exit({ kind: 'trail_hit' }))
    await createExitNotification(exit({ kind: 'tp1_partial' }))
    const sevs = createMock.mock.calls.map((c) => (c[0] as CreateArg).severity)
    expect(sevs).toEqual(['success', 'success', 'warning'])
  })

  it('returns null on a duplicate (E11000) so email/push are skipped', async () => {
    createMock.mockRejectedValueOnce({ code: 11000 })
    const res = await createExitNotification(exit({}))
    expect(res).toBeNull()
  })

  it('rethrows non-duplicate errors', async () => {
    createMock.mockRejectedValueOnce(new Error('db down'))
    await expect(createExitNotification(exit({}))).rejects.toThrow('db down')
  })
})

function alert(partial: Partial<TriggeredAlert>): TriggeredAlert {
  return {
    instrumentToken: 'T1',
    instrumentSymbol: 'SBIN',
    exchange: 'NSE',
    alertId: 'a1',
    type: 'price',
    direction: 'below',
    targetPrice: 100,
    triggerValue: 99,
    ltp: 99,
    dayChangePct: -1.2,
    note: '',
    triggeredAt: new Date('2024-06-01T10:00:00Z'),
    source: 'watchlist',
    ...partial,
  }
}

describe('createAlertNotification', () => {
  it('maps a legacy price alert to price_below / price_above', async () => {
    await createAlertNotification(alert({ type: 'price', direction: 'below' }))
    await createAlertNotification(alert({ type: 'price', direction: 'above' }))
    const kinds = createMock.mock.calls.map((c) => (c[0] as { kind: string }).kind)
    expect(kinds).toEqual(['price_below', 'price_above'])
  })

  it('maps an advanced condition to the generic "alert" kind + conditionType', async () => {
    await createAlertNotification(
      alert({
        type: 'volume',
        direction: undefined,
        targetPrice: undefined,
        config: { multiple: 3 },
        triggerValue: 5_000_000,
      }),
    )
    const arg = createMock.mock.calls[0]![0] as {
      kind: string
      conditionType: string
      severity: string
      body: string
    }
    expect(arg.kind).toBe('alert')
    expect(arg.conditionType).toBe('volume')
    expect(arg.severity).toBe('info')
    expect(arg.body).toContain('20-day average')
  })
})
