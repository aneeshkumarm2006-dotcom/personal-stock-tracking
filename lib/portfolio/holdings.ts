export type TransactionCharges = {
  brokerage?: number
  stt?: number
  exchFees?: number
  gst?: number
  stampDuty?: number
  sebiFees?: number
}

export type TransactionForHoldings = {
  instrumentToken: string
  instrumentSymbol?: string | null
  type: 'BUY' | 'SELL'
  quantity: number
  price: number
  date: Date | string
  charges?: TransactionCharges | null
}

export type HoldingData = {
  instrumentToken: string
  instrumentSymbol: string
  netQty: number
  avgBuyPrice: number
  totalInvested: number
  realizedPnL: number
  isClosed: boolean
}

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

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

type Lot = {
  qty: number
  price: number
  perUnitCharge: number
}

export type LedgerCheckTx = {
  type: 'BUY' | 'SELL'
  quantity: number
  date: Date | string
}

// True when, replaying the ledger in date order, sold quantity ever exceeds
// bought quantity (i.e. an oversell / short position, which this cash-equity
// ledger does not support). Ties on date keep input order (stable sort), so
// callers should append the candidate transaction after existing ones.
export function hasNegativeBalance(transactions: LedgerCheckTx[]): boolean {
  const ordered = [...transactions].sort((a, b) => toTime(a.date) - toTime(b.date))
  let balance = 0
  for (const tx of ordered) {
    balance += tx.type === 'BUY' ? tx.quantity : -tx.quantity
    if (balance < 0) return true
  }
  return false
}

export function computeHoldings(transactions: TransactionForHoldings[]): HoldingData[] {
  const byToken = new Map<string, TransactionForHoldings[]>()
  for (const tx of transactions) {
    const list = byToken.get(tx.instrumentToken)
    if (list) {
      list.push(tx)
    } else {
      byToken.set(tx.instrumentToken, [tx])
    }
  }

  const results: HoldingData[] = []

  for (const [token, txs] of byToken) {
    const ordered = [...txs].sort((a, b) => toTime(a.date) - toTime(b.date))
    const lots: Lot[] = []
    let realizedPnL = 0
    let symbol = ''

    for (const tx of ordered) {
      if (tx.instrumentSymbol) symbol = tx.instrumentSymbol

      if (tx.type === 'BUY') {
        const totalCharge = sumCharges(tx.charges)
        const perUnit = tx.quantity > 0 ? totalCharge / tx.quantity : 0
        lots.push({ qty: tx.quantity, price: tx.price, perUnitCharge: perUnit })
        continue
      }

      // SELL: consume FIFO lots
      let remaining = tx.quantity
      const sellCharges = sumCharges(tx.charges)
      let matchedQty = 0
      let buyCostMatched = 0

      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0]
        if (!lot) break
        const take = Math.min(lot.qty, remaining)
        buyCostMatched += take * (lot.price + lot.perUnitCharge)
        matchedQty += take
        lot.qty -= take
        remaining -= take
        if (lot.qty === 0) lots.shift()
      }

      const sellProceeds = matchedQty * tx.price - sellCharges
      realizedPnL += sellProceeds - buyCostMatched
    }

    let netQty = 0
    let lotCost = 0
    for (const lot of lots) {
      netQty += lot.qty
      lotCost += lot.qty * (lot.price + lot.perUnitCharge)
    }

    const totalInvested = round2(lotCost)
    const avgBuyPrice = netQty > 0 ? round2(lotCost / netQty) : 0
    const isClosed = netQty === 0

    results.push({
      instrumentToken: token,
      instrumentSymbol: symbol,
      netQty,
      avgBuyPrice,
      totalInvested,
      realizedPnL: round2(realizedPnL),
      isClosed,
    })
  }

  return results
}
