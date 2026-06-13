import { describe, it, expect } from 'vitest'
import {
  computeHoldings,
  hasNegativeBalance,
  type LedgerCheckTx,
  type TransactionForHoldings,
} from '@/lib/portfolio/holdings'

const tx = (
  partial: Partial<TransactionForHoldings> & {
    type: 'BUY' | 'SELL'
    quantity: number
    price: number
    date: string
  },
): TransactionForHoldings => ({
  instrumentToken: '3045',
  instrumentSymbol: 'SBIN-EQ',
  ...partial,
})

describe('computeHoldings', () => {
  it('single BUY: netQty, avgBuyPrice, totalInvested set; realizedPnL = 0', () => {
    const result = computeHoldings([
      tx({ type: 'BUY', quantity: 10, price: 100, date: '2024-01-01' }),
    ])
    expect(result).toHaveLength(1)
    const h = result[0]!
    expect(h.netQty).toBe(10)
    expect(h.avgBuyPrice).toBe(100)
    expect(h.totalInvested).toBe(1000)
    expect(h.realizedPnL).toBe(0)
    expect(h.isClosed).toBe(false)
  })

  it('BUY then full SELL: netQty = 0; realizedPnL includes charges; isClosed true', () => {
    const result = computeHoldings([
      tx({
        type: 'BUY',
        quantity: 10,
        price: 100,
        date: '2024-01-01',
        charges: { brokerage: 20 },
      }),
      tx({
        type: 'SELL',
        quantity: 10,
        price: 120,
        date: '2024-02-01',
        charges: { brokerage: 30 },
      }),
    ])
    const h = result[0]!
    expect(h.netQty).toBe(0)
    expect(h.isClosed).toBe(true)
    // proceeds = 10*120 - 30 = 1170. cost = 10*100 + 20 = 1020. pnl = 150
    expect(h.realizedPnL).toBe(150)
    expect(h.totalInvested).toBe(0)
  })

  it('BUY then partial SELL: remaining netQty and avgBuyPrice are correct', () => {
    const result = computeHoldings([
      tx({ type: 'BUY', quantity: 10, price: 100, date: '2024-01-01' }),
      tx({ type: 'SELL', quantity: 4, price: 120, date: '2024-02-01' }),
    ])
    const h = result[0]!
    expect(h.netQty).toBe(6)
    expect(h.avgBuyPrice).toBe(100)
    expect(h.totalInvested).toBe(600)
    expect(h.realizedPnL).toBe(80) // (120-100)*4
  })

  it('two BUYs at different prices then full SELL uses FIFO ordering', () => {
    const result = computeHoldings([
      tx({ type: 'BUY', quantity: 10, price: 100, date: '2024-01-01' }),
      tx({ type: 'BUY', quantity: 10, price: 150, date: '2024-01-15' }),
      tx({ type: 'SELL', quantity: 20, price: 200, date: '2024-02-01' }),
    ])
    const h = result[0]!
    expect(h.netQty).toBe(0)
    // FIFO: sell 10@200 vs buy 10@100 = 1000 pnl; sell 10@200 vs buy 10@150 = 500 pnl
    expect(h.realizedPnL).toBe(1500)
  })

  it('BUY -> SELL -> BUY (averaging up) sets correct avgBuyPrice after the second buy', () => {
    const result = computeHoldings([
      tx({ type: 'BUY', quantity: 10, price: 100, date: '2024-01-01' }),
      tx({ type: 'SELL', quantity: 10, price: 120, date: '2024-02-01' }),
      tx({ type: 'BUY', quantity: 5, price: 150, date: '2024-03-01' }),
    ])
    const h = result[0]!
    expect(h.netQty).toBe(5)
    expect(h.avgBuyPrice).toBe(150)
    expect(h.totalInvested).toBe(750)
    expect(h.realizedPnL).toBe(200)
  })

  it('groups transactions per instrument token', () => {
    const result = computeHoldings([
      tx({ instrumentToken: '1', instrumentSymbol: 'A', type: 'BUY', quantity: 5, price: 10, date: '2024-01-01' }),
      tx({ instrumentToken: '2', instrumentSymbol: 'B', type: 'BUY', quantity: 5, price: 20, date: '2024-01-01' }),
    ])
    expect(result).toHaveLength(2)
    const a = result.find((r) => r.instrumentToken === '1')!
    const b = result.find((r) => r.instrumentToken === '2')!
    expect(a.netQty).toBe(5)
    expect(b.netQty).toBe(5)
  })
})

describe('hasNegativeBalance', () => {
  const ledger = (
    ...txs: Array<[type: 'BUY' | 'SELL', quantity: number, date: string]>
  ): LedgerCheckTx[] => txs.map(([type, quantity, date]) => ({ type, quantity, date }))

  it('returns false for a buy followed by a smaller sell', () => {
    expect(
      hasNegativeBalance(ledger(['BUY', 10, '2024-01-01'], ['SELL', 4, '2024-02-01'])),
    ).toBe(false)
  })

  it('returns true when a sell exceeds the held quantity', () => {
    expect(
      hasNegativeBalance(ledger(['BUY', 10, '2024-01-01'], ['SELL', 11, '2024-02-01'])),
    ).toBe(true)
  })

  it('returns true when a sell is dated before the buy that would cover it', () => {
    expect(
      hasNegativeBalance(ledger(['BUY', 10, '2024-02-01'], ['SELL', 5, '2024-01-01'])),
    ).toBe(true)
  })

  it('keeps input order on equal dates (buy then sell same day is fine)', () => {
    expect(
      hasNegativeBalance(ledger(['BUY', 10, '2024-01-01'], ['SELL', 10, '2024-01-01'])),
    ).toBe(false)
  })

  it('returns false for an empty ledger', () => {
    expect(hasNegativeBalance([])).toBe(false)
  })
})
