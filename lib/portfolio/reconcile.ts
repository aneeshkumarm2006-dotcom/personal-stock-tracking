import type { AngelHolding, AngelTrade } from '@/lib/angelone/portfolio'
import type { TransactionInput } from '@/lib/validation/schemas'

// Marker prefix written into the `notes` of every sync-generated transaction so
// they can be identified, audited, or filtered later.
export const SYNC_NOTE_PREFIX = '[angel-sync]'

// What the app currently believes is held, derived from the transaction ledger
// (computeHoldings). Only open positions (netQty > 0) need to be passed in;
// closed ones contribute a qty of 0 either way.
export type AppHoldingQty = {
  instrumentToken: string
  instrumentSymbol: string
  netQty: number
}

export type PriceSource = 'tradebook' | 'average' | 'ltp' | 'none'

// One reconciled instrument: the difference between Angel One's live quantity and
// the app ledger's quantity, and how (if at all) it was resolved into a transaction.
export type ReconcileLine = {
  instrumentToken: string
  instrumentSymbol: string
  appQty: number
  angelQty: number
  delta: number
  action: 'BUY' | 'SELL' | 'none'
  quantity: number
  price: number
  priceSource: PriceSource
  // Set when a delta could not be turned into a transaction (e.g. a SELL with no
  // recoverable price). Surfaced so the caller can warn instead of silently
  // dropping it.
  skipped?: string
}

export type ReconcileResult = {
  transactions: TransactionInput[]
  lines: ReconcileLine[]
}

export type ReconcileOptions = {
  // Timestamp stamped on every generated transaction (kept as a parameter so this
  // function stays pure / deterministic in tests).
  syncDate: Date
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// Aggregate today's fills per (token, side) into a quantity-weighted average
// price. The trade book can hold several partial fills for one order; the
// weighted average is the effective execution price.
type TradeAgg = { quantity: number; weightedPrice: number; symbol: string }

function aggregateTrades(trades: AngelTrade[]): Map<string, TradeAgg> {
  const map = new Map<string, TradeAgg>()
  for (const trade of trades) {
    const key = `${trade.token}:${trade.type}`
    const existing = map.get(key)
    if (existing) {
      const totalQty = existing.quantity + trade.quantity
      existing.weightedPrice =
        (existing.weightedPrice * existing.quantity + trade.price * trade.quantity) / totalQty
      existing.quantity = totalQty
    } else {
      map.set(key, {
        quantity: trade.quantity,
        weightedPrice: trade.price,
        symbol: trade.symbol,
      })
    }
  }
  return map
}

// Reconcile the app ledger against Angel One's live holdings, producing the
// corrective BUY/SELL transactions that make the ledger match reality.
//
// For each instrument the quantity delta drives the action:
//   angelQty > appQty  -> BUY  (delta)   shares were acquired since last sync
//   angelQty < appQty  -> SELL (|delta|) shares were sold since last sync
//   equal              -> no-op (already in sync; re-runs are idempotent)
//
// Price is resolved with a preference order, most-accurate first:
//   1. tradebook — exact weighted fill price for today's matching side
//   2. average   — Angel's running average price (good for BUYs)
//   3. ltp       — last traded price (approximate; used for SELLs with no fill)
// A SELL that cannot be priced at all is skipped rather than guessed at zero.
export function reconcileHoldings(
  appHoldings: AppHoldingQty[],
  angelHoldings: AngelHolding[],
  trades: AngelTrade[],
  options: ReconcileOptions,
): ReconcileResult {
  const appByToken = new Map<string, AppHoldingQty>()
  for (const h of appHoldings) appByToken.set(h.instrumentToken, h)

  const angelByToken = new Map<string, AngelHolding>()
  for (const h of angelHoldings) angelByToken.set(h.token, h)

  const tradeAgg = aggregateTrades(trades)

  const tokens = new Set<string>([...appByToken.keys(), ...angelByToken.keys()])

  const lines: ReconcileLine[] = []
  const transactions: TransactionInput[] = []

  for (const token of tokens) {
    const app = appByToken.get(token)
    const angel = angelByToken.get(token)

    const appQty = app?.netQty ?? 0
    const angelQty = angel?.quantity ?? 0
    const delta = angelQty - appQty

    const symbol = angel?.symbol || app?.instrumentSymbol || ''

    if (delta === 0) {
      lines.push({
        instrumentToken: token,
        instrumentSymbol: symbol,
        appQty,
        angelQty,
        delta: 0,
        action: 'none',
        quantity: 0,
        price: 0,
        priceSource: 'none',
      })
      continue
    }

    const action: 'BUY' | 'SELL' = delta > 0 ? 'BUY' : 'SELL'
    const quantity = Math.abs(delta)

    // Resolve price.
    let price = 0
    let priceSource: PriceSource = 'none'
    const fill = tradeAgg.get(`${token}:${action}`)
    if (fill && fill.weightedPrice > 0) {
      price = round2(fill.weightedPrice)
      priceSource = 'tradebook'
    } else if (action === 'BUY' && angel && angel.averagePrice > 0) {
      price = round2(angel.averagePrice)
      priceSource = 'average'
    } else if (angel && angel.ltp > 0) {
      price = round2(angel.ltp)
      priceSource = 'ltp'
    }

    if (price <= 0) {
      lines.push({
        instrumentToken: token,
        instrumentSymbol: symbol,
        appQty,
        angelQty,
        delta,
        action,
        quantity,
        price: 0,
        priceSource: 'none',
        skipped: `no price available for ${action} of ${quantity}`,
      })
      continue
    }

    lines.push({
      instrumentToken: token,
      instrumentSymbol: symbol,
      appQty,
      angelQty,
      delta,
      action,
      quantity,
      price,
      priceSource,
    })

    transactions.push({
      instrumentToken: token,
      instrumentSymbol: symbol,
      type: action,
      quantity,
      price,
      date: options.syncDate,
      charges: { brokerage: 0, stt: 0, exchFees: 0, gst: 0, stampDuty: 0, sebiFees: 0, total: 0 },
      notes: `${SYNC_NOTE_PREFIX} ${action} ${quantity} @ ${price} (price: ${priceSource})`,
    })
  }

  return { transactions, lines }
}
