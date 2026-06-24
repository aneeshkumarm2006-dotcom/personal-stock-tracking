import type { TransactionCharges } from './holdings'

// One day on the wealth chart. All four values are in rupees.
export type WealthSeriesPoint = {
  date: string // yyyy-mm-dd (IST trading day)
  cash: number // available cash: fundsAdded − netInvested as of this day
  investmentValue: number // market value of open holdings as of this day
  niftyValue: number // lump-sum invested capital grown at Nifty since day 1
  fdValue: number // lump-sum invested capital grown at the FD rate since day 1
}

export type WealthTx = {
  instrumentToken: string
  type: 'BUY' | 'SELL'
  quantity: number
  price: number
  date: Date | string
  charges?: TransactionCharges | null
}

export type WealthSeriesInput = {
  transactions: WealthTx[]
  // Master date axis: sorted yyyy-mm-dd trading days (typically Nifty's calendar).
  tradingDates: string[]
  // token -> (yyyy-mm-dd -> close). Sparse; missing days are carried forward.
  closesByToken: Map<string, Map<string, number>>
  // yyyy-mm-dd -> Nifty close. Sparse; missing days are carried forward.
  niftyCloses: Map<string, number>
  // Current total funds deposited. Held flat across history (deposit dates are
  // not recorded — the "approximate from trades" model), so the cash line only
  // moves with buys and sells.
  fundsAdded: number
  // Annual FD rate as a fraction, e.g. 0.075 for 7.5%.
  fdAnnualRate: number
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

function dayString(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toISOString().slice(0, 10)
}

// Years (fractional) between two yyyy-mm-dd strings, using a 365.25-day year so
// the FD curve compounds smoothly across the whole range.
function yearsBetween(fromDay: string, toDay: string): number {
  const from = new Date(`${fromDay}T00:00:00Z`).getTime()
  const to = new Date(`${toDay}T00:00:00Z`).getTime()
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000)
}

/**
 * Build the daily wealth history with four comparable lines.
 *
 * - **cash**: fundsAdded − netInvested as of each day (net invested replayed
 *   from the dated ledger).
 * - **investmentValue**: open-holdings quantity × that day's close, summed.
 *   Closed positions contribute nothing — their proceeds already live in cash.
 * - **niftyValue** / **fdValue**: the benchmarks. We take the total capital ever
 *   deployed into stocks (Σ buy cost incl. charges) as a single lump sum placed
 *   on the first trading day, then grow it by Nifty's return / the FD rate. This
 *   is the "lump sum at first purchase" comparison.
 *
 * Pure and deterministic: all market data is passed in via the close maps.
 */
export function buildWealthSeries(input: WealthSeriesInput): WealthSeriesPoint[] {
  const {
    transactions,
    tradingDates,
    closesByToken,
    niftyCloses,
    fundsAdded,
    fdAnnualRate,
  } = input

  if (transactions.length === 0 || tradingDates.length === 0) return []

  const ordered = [...transactions].sort((a, b) => toTime(a.date) - toTime(b.date))
  const firstTxDay = dayString(ordered[0]!.date)

  // Axis starts no earlier than the first transaction.
  const axis = tradingDates.filter((d) => d >= firstTxDay).sort()
  if (axis.length === 0) return []
  const anchorDay = axis[0]!

  // Lump-sum principal for the benchmarks: every rupee ever spent buying stock.
  let principal = 0
  for (const tx of ordered) {
    if (tx.type === 'BUY') {
      principal += tx.quantity * tx.price + sumCharges(tx.charges)
    }
  }
  principal = round2(principal)

  // Carry-forward state, advanced as we walk the axis in ascending date order.
  const qtyByToken = new Map<string, number>()
  const lastCloseByToken = new Map<string, number>()
  let netInvested = 0
  let niftyLast: number | null = null
  let niftyAnchor: number | null = null
  let txIdx = 0

  const series: WealthSeriesPoint[] = []

  for (const day of axis) {
    // Apply every transaction that has happened on or before this day.
    while (txIdx < ordered.length && dayString(ordered[txIdx]!.date) <= day) {
      const tx = ordered[txIdx]!
      const signedQty = tx.type === 'BUY' ? tx.quantity : -tx.quantity
      qtyByToken.set(
        tx.instrumentToken,
        (qtyByToken.get(tx.instrumentToken) ?? 0) + signedQty,
      )
      // Charges are excluded from the cash line (Angel One behaviour: a charge
      // only lifts the ATP, it is not debited from cash — see computeNetInvested).
      netInvested += tx.type === 'BUY' ? tx.quantity * tx.price : -(tx.quantity * tx.price)
      txIdx++
    }

    // Refresh carried-forward closes for any token that traded today.
    for (const [token, closes] of closesByToken) {
      const close = closes.get(day)
      if (close !== undefined) lastCloseByToken.set(token, close)
    }
    const niftyToday = niftyCloses.get(day)
    if (niftyToday !== undefined) {
      niftyLast = niftyToday
      if (niftyAnchor === null) niftyAnchor = niftyToday
    }

    let investmentValue = 0
    for (const [token, qty] of qtyByToken) {
      if (qty <= 0) continue
      const close = lastCloseByToken.get(token)
      if (close !== undefined) investmentValue += qty * close
    }

    const niftyValue =
      niftyAnchor && niftyLast ? (principal * niftyLast) / niftyAnchor : principal
    const fdValue = principal * Math.pow(1 + fdAnnualRate, yearsBetween(anchorDay, day))

    series.push({
      date: day,
      cash: round2(fundsAdded - netInvested),
      investmentValue: round2(investmentValue),
      niftyValue: round2(niftyValue),
      fdValue: round2(fdValue),
    })
  }

  return series
}
