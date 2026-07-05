export type TransactionCharges = {
  brokerage?: number
  stt?: number
  exchFees?: number
  gst?: number
  stampDuty?: number
  sebiFees?: number
  // Single combined charge amount (new UI). Older transactions instead split the
  // total across the six fields above; every consumer sums them all, so the two
  // forms are interchangeable. A trade uses one form or the other, never both.
  total?: number
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
    (charges.sebiFees ?? 0) +
    (charges.total ?? 0)
  )
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

// Orders the ledger for replay: by date ascending, then BUY before SELL on ties.
// The tie-break matters because dates are commonly stored at midnight (no
// intraday time), so a same-day BUY and SELL collide on timestamp. This is a
// long-only cash-equity ledger — you cannot sell before you buy on the same day
// — so a same-date BUY must always be replayed first. Without this, a same-day
// round trip could sort SELL-first, match nothing, and leave the position
// wrongly open (netQty > 0) instead of closed.
function compareForReplay(
  a: { type: 'BUY' | 'SELL'; date: Date | string },
  b: { type: 'BUY' | 'SELL'; date: Date | string },
): number {
  const byDate = toTime(a.date) - toTime(b.date)
  if (byDate !== 0) return byDate
  const rank = (t: 'BUY' | 'SELL') => (t === 'BUY' ? 0 : 1)
  return rank(a.type) - rank(b.type)
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
// ledger does not support). Ties on date replay BUY before SELL (see
// compareForReplay), so a same-day buy is available to cover a same-day sell.
export function hasNegativeBalance(transactions: LedgerCheckTx[]): boolean {
  const ordered = [...transactions].sort(compareForReplay)
  let balance = 0
  for (const tx of ordered) {
    balance += tx.type === 'BUY' ? tx.quantity : -tx.quantity
    if (balance < 0) return true
  }
  return false
}

// True when deleting `removed` would *introduce* an oversell (sold qty > bought
// qty) that the surviving `remaining` transactions alone exhibit. Mirrors the
// create/edit guards: a delete is only blocked when it newly breaks the ledger.
// A ledger that was already inconsistent isn't the delete's fault, so removing a
// transaction from it (which can only reduce the oversell) is allowed.
export function deleteIntroducesOversell(
  remaining: LedgerCheckTx[],
  removed: LedgerCheckTx,
): boolean {
  return !hasNegativeBalance([...remaining, removed]) && hasNegativeBalance(remaining)
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
    const ordered = [...txs].sort(compareForReplay)
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
