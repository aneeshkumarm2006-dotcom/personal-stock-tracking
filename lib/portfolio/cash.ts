import type { TransactionCharges, TransactionForHoldings } from './holdings'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function sumCharges(charges?: TransactionCharges | null): number {
  if (!charges) return 0
  return (
    (charges.brokerage ?? 0) +
    (charges.stt ?? 0) +
    (charges.exchFees ?? 0) +
    (charges.gst ?? 0) +
    (charges.stampDuty ?? 0) +
    (charges.sebiFees ?? 0)
  )
}

export type CashFlowTx = Pick<
  TransactionForHoldings,
  'type' | 'quantity' | 'price' | 'charges'
>

// Net cash deployed into the market across the whole ledger:
//   BUY outflow  = quantity * price + charges   (cash leaves the account)
//   SELL inflow  = quantity * price - charges   (cash returns to the account)
// netInvested = Σ buy outflow − Σ sell inflow. Can go negative once realized
// proceeds exceed the original outlay (i.e. you've pulled more cash out of the
// market than you put in).
export function computeNetInvested(transactions: CashFlowTx[]): number {
  let net = 0
  for (const tx of transactions) {
    const charges = sumCharges(tx.charges)
    const gross = tx.quantity * tx.price
    net += tx.type === 'BUY' ? gross + charges : -(gross - charges)
  }
  return round2(net)
}

export type CashSummary = {
  fundsAdded: number
  netInvested: number
  availableCash: number
}

// Available cash is simply the funds you've added to the account minus what is
// currently deployed into the market.
export function computeCash(fundsAdded: number, netInvested: number): CashSummary {
  return {
    fundsAdded: round2(fundsAdded),
    netInvested: round2(netInvested),
    availableCash: round2(fundsAdded - netInvested),
  }
}
