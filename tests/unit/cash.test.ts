import { describe, it, expect } from 'vitest'
import {
  computeCash,
  computeNetInvested,
  type CashFlowTx,
} from '@/lib/portfolio/cash'

const tx = (partial: CashFlowTx): CashFlowTx => partial

describe('computeNetInvested', () => {
  it('is zero for an empty ledger', () => {
    expect(computeNetInvested([])).toBe(0)
  })

  it('BUY adds cost plus charges to net invested', () => {
    const net = computeNetInvested([
      tx({
        type: 'BUY',
        quantity: 10,
        price: 100,
        charges: { brokerage: 20, stt: 5 },
      }),
    ])
    expect(net).toBe(1025)
  })

  it('SELL returns proceeds net of charges (reduces net invested)', () => {
    const net = computeNetInvested([
      tx({ type: 'BUY', quantity: 10, price: 100 }),
      tx({ type: 'SELL', quantity: 10, price: 120, charges: { brokerage: 30 } }),
    ])
    // outflow 1000 - inflow (1200 - 30) = 1000 - 1170 = -170
    expect(net).toBe(-170)
  })

  it('handles a partial sell', () => {
    const net = computeNetInvested([
      tx({ type: 'BUY', quantity: 10, price: 100 }),
      tx({ type: 'SELL', quantity: 4, price: 150 }),
    ])
    // 1000 - 600 = 400
    expect(net).toBe(400)
  })
})

describe('computeCash', () => {
  it('available cash = funds added minus net invested', () => {
    const cash = computeCash(50000, 1025)
    expect(cash.fundsAdded).toBe(50000)
    expect(cash.netInvested).toBe(1025)
    expect(cash.availableCash).toBe(48975)
  })

  it('goes negative when invested beyond funds added (forgot to add funds)', () => {
    const cash = computeCash(1000, 1500)
    expect(cash.availableCash).toBe(-500)
  })

  it('exceeds funds added once realized proceeds exceed outlay', () => {
    const cash = computeCash(1000, -170)
    expect(cash.availableCash).toBe(1170)
  })

  it('rounds to two decimals', () => {
    const cash = computeCash(100.005, 0)
    expect(cash.fundsAdded).toBe(100.01)
  })
})
