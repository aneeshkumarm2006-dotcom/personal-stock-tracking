import type { TransactionForHoldings } from './holdings'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export type CashFlowTx = Pick<
  TransactionForHoldings,
  'type' | 'quantity' | 'price' | 'charges'
>

// Net cash deployed into the market across the whole ledger:
//   BUY outflow  = quantity * price   (cash leaves the account)
//   SELL inflow  = quantity * price   (cash returns to the account)
// netInvested = Σ buy outflow − Σ sell inflow. Can go negative once realized
// proceeds exceed the original outlay (i.e. you've pulled more cash out of the
// market than you put in).
//
// Charges are deliberately EXCLUDED from cash. Mirroring Angel One, a charge
// only raises the average buy price (ATP / cost basis — see computeHoldings);
// it is never debited from available cash. So a ₹1 charge on a buy surfaces as
// a slightly higher ATP (and thus a small unrealized loss), not as a cash dip.
export function computeNetInvested(transactions: CashFlowTx[]): number {
  let net = 0
  for (const tx of transactions) {
    const gross = tx.quantity * tx.price
    net += tx.type === 'BUY' ? gross : -gross
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
