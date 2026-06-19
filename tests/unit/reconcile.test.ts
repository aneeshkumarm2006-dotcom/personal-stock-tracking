import { describe, it, expect } from 'vitest'

import type { AngelHolding, AngelTrade } from '@/lib/angelone/portfolio'
import {
  reconcileHoldings,
  SYNC_NOTE_PREFIX,
  type AppHoldingQty,
} from '@/lib/portfolio/reconcile'

const SYNC_DATE = new Date('2026-06-19T10:02:00.000Z')

function holding(partial: Partial<AngelHolding> & { token: string }): AngelHolding {
  return {
    symbol: `SYM-${partial.token}`,
    exchange: 'NSE',
    quantity: 0,
    averagePrice: 0,
    ltp: 0,
    ...partial,
  }
}

function trade(partial: Partial<AngelTrade> & { token: string; type: 'BUY' | 'SELL' }): AngelTrade {
  return {
    symbol: `SYM-${partial.token}`,
    price: 0,
    quantity: 0,
    fillTime: '13:00:00',
    ...partial,
  }
}

function app(token: string, netQty: number): AppHoldingQty {
  return { instrumentToken: token, instrumentSymbol: `SYM-${token}`, netQty }
}

describe('reconcileHoldings', () => {
  it('produces nothing when ledger already matches Angel One (idempotent)', () => {
    const result = reconcileHoldings(
      [app('1', 100)],
      [holding({ token: '1', quantity: 100, averagePrice: 50, ltp: 60 })],
      [],
      { syncDate: SYNC_DATE },
    )
    expect(result.transactions).toHaveLength(0)
    expect(result.lines[0]?.action).toBe('none')
    expect(result.lines[0]?.delta).toBe(0)
  })

  it('detects a partial SELL and prices it from the trade book', () => {
    // App thinks 100 held; Angel now shows 50 -> sold 50. Trade book has the fill.
    const result = reconcileHoldings(
      [app('1', 100)],
      [holding({ token: '1', quantity: 50, averagePrice: 50, ltp: 130 })],
      [trade({ token: '1', type: 'SELL', price: 128.5, quantity: 50 })],
      { syncDate: SYNC_DATE },
    )
    expect(result.transactions).toHaveLength(1)
    const tx = result.transactions[0]!
    expect(tx.type).toBe('SELL')
    expect(tx.quantity).toBe(50)
    expect(tx.price).toBe(128.5)
    expect(tx.notes).toContain(SYNC_NOTE_PREFIX)
    expect(result.lines[0]?.priceSource).toBe('tradebook')
  })

  it('detects a BUY top-up and falls back to average price when no fill', () => {
    const result = reconcileHoldings(
      [app('1', 100)],
      [holding({ token: '1', quantity: 150, averagePrice: 75.25, ltp: 80 })],
      [],
      { syncDate: SYNC_DATE },
    )
    const tx = result.transactions[0]!
    expect(tx.type).toBe('BUY')
    expect(tx.quantity).toBe(50)
    expect(tx.price).toBe(75.25)
    expect(result.lines[0]?.priceSource).toBe('average')
  })

  it('imports a brand-new holding not in the ledger', () => {
    const result = reconcileHoldings(
      [],
      [holding({ token: '9', symbol: 'ITC-EQ', quantity: 40, averagePrice: 285.5, ltp: 412 })],
      [],
      { syncDate: SYNC_DATE },
    )
    const tx = result.transactions[0]!
    expect(tx.type).toBe('BUY')
    expect(tx.quantity).toBe(40)
    expect(tx.price).toBe(285.5)
    expect(tx.instrumentSymbol).toBe('ITC-EQ')
  })

  it('records a full exit when a holding disappears from Angel One', () => {
    const result = reconcileHoldings(
      [app('1', 30)],
      [],
      [trade({ token: '1', type: 'SELL', price: 99, quantity: 30 })],
      { syncDate: SYNC_DATE },
    )
    const tx = result.transactions[0]!
    expect(tx.type).toBe('SELL')
    expect(tx.quantity).toBe(30)
    expect(tx.price).toBe(99)
  })

  it('uses LTP for a SELL with no trade-book fill', () => {
    const result = reconcileHoldings(
      [app('1', 100)],
      [holding({ token: '1', quantity: 60, averagePrice: 50, ltp: 142.75 })],
      [],
      { syncDate: SYNC_DATE },
    )
    const tx = result.transactions[0]!
    expect(tx.type).toBe('SELL')
    expect(tx.price).toBe(142.75)
    expect(result.lines[0]?.priceSource).toBe('ltp')
  })

  it('skips (does not guess) a SELL that cannot be priced at all', () => {
    const result = reconcileHoldings(
      [app('1', 100)],
      [holding({ token: '1', quantity: 60, averagePrice: 0, ltp: 0 })],
      [],
      { syncDate: SYNC_DATE },
    )
    expect(result.transactions).toHaveLength(0)
    expect(result.lines[0]?.skipped).toBeDefined()
  })

  it('weights multiple partial fills into one average price', () => {
    const result = reconcileHoldings(
      [app('1', 0)],
      [holding({ token: '1', quantity: 30, averagePrice: 100, ltp: 100 })],
      [
        trade({ token: '1', type: 'BUY', price: 100, quantity: 10 }),
        trade({ token: '1', type: 'BUY', price: 130, quantity: 20 }),
      ],
      { syncDate: SYNC_DATE },
    )
    const tx = result.transactions[0]!
    // (100*10 + 130*20) / 30 = 120
    expect(tx.price).toBe(120)
    expect(result.lines[0]?.priceSource).toBe('tradebook')
  })
})
