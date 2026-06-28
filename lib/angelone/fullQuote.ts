import { getSmartApi, withRetry } from './client'
import { NetworkError, classifyAngelError } from './errors'

// A single market-depth level (one price step of the best-5 bid/ask ladder).
export type MarketDepthLevel = {
  price: number
  quantity: number
  orders: number
}

// The complete FULL-mode quote for one instrument. Angel One's quote endpoint
// returns far more than the trimmed PriceSnapshotData used by the refresh cycle
// (lib/angelone/quotes.ts) — the research page surfaces all of it. Every field
// is optional because the exchange can omit any of them (e.g. depth is empty
// before market open, opnInterest is ~0 for cash equities).
export type FullQuote = {
  token: string
  symbol?: string
  exchange?: string
  // Price
  ltp?: number
  open?: number
  high?: number
  low?: number
  close?: number // previous close
  netChange?: number
  pctChange?: number
  avgPrice?: number
  lastTradeQty?: number
  // Range / circuits
  week52High?: number
  week52Low?: number
  upperCircuit?: number
  lowerCircuit?: number
  // Liquidity / order book
  tradeVolume?: number
  totalBuyQty?: number
  totalSellQty?: number
  openInterest?: number
  depth?: { buy: MarketDepthLevel[]; sell: MarketDepthLevel[] }
  // Timestamps (exchange-reported strings, e.g. "13-Mar-2024 11:07:56")
  exchFeedTime?: string
  exchTradeTime?: string
  // When this app fetched the quote.
  fetchedAt: string
}

// Angel One's FULL-mode rows use mixed camelCase keys (tradingSymbol, opnInterest
// — note the missing "e" — totBuyQuan, etc.) and 52-week keys that start with a
// digit ("52WeekHigh"), so they can't be plain identifiers. Some deployments have
// been observed returning all-lowercase keys, so we read every field defensively
// across casing variants, mirroring the existing normalize() in quotes.ts.
type RawFullRow = Record<string, unknown>

function num(row: RawFullRow, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key]
    if (value === null || value === undefined || value === '') continue
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function str(row: RawFullRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

function parseDepthSide(value: unknown): MarketDepthLevel[] {
  if (!Array.isArray(value)) return []
  const levels: MarketDepthLevel[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as RawFullRow
    const price = num(row, 'price') ?? 0
    const quantity = num(row, 'quantity', 'quanity') ?? 0
    const orders = num(row, 'orders', 'numberOfOrders') ?? 0
    // Drop empty padding levels the exchange sends when the book is thin.
    if (price === 0 && quantity === 0 && orders === 0) continue
    levels.push({ price, quantity, orders })
  }
  return levels
}

function parseDepth(value: unknown): FullQuote['depth'] {
  if (!value || typeof value !== 'object') return undefined
  const row = value as RawFullRow
  const buy = parseDepthSide(row.buy ?? row.Buy)
  const sell = parseDepthSide(row.sell ?? row.Sell)
  if (buy.length === 0 && sell.length === 0) return undefined
  return { buy, sell }
}

export function normalizeFullQuote(
  raw: RawFullRow,
  fetchedAt: Date,
): FullQuote | null {
  const token = str(raw, 'symbolToken', 'symboltoken', 'token')
  if (!token) return null

  return {
    token,
    symbol: str(raw, 'tradingSymbol', 'tradingsymbol', 'symbol'),
    exchange: str(raw, 'exchange'),
    ltp: num(raw, 'ltp'),
    open: num(raw, 'open'),
    high: num(raw, 'high'),
    low: num(raw, 'low'),
    close: num(raw, 'close'),
    netChange: num(raw, 'netChange', 'netchange'),
    pctChange: num(raw, 'percentChange', 'percentchange', 'pChange'),
    avgPrice: num(raw, 'avgPrice', 'avgprice'),
    lastTradeQty: num(raw, 'lastTradeQty', 'lasttradeqty'),
    week52High: num(raw, '52WeekHigh', '52weekHigh', 'weekHigh52'),
    week52Low: num(raw, '52WeekLow', '52weekLow', 'weekLow52'),
    upperCircuit: num(raw, 'upperCircuit', 'uppercircuit'),
    lowerCircuit: num(raw, 'lowerCircuit', 'lowercircuit'),
    tradeVolume: num(raw, 'tradeVolume', 'tradevolume', 'volume'),
    totalBuyQty: num(raw, 'totBuyQuan', 'totbuyquan', 'totalBuyQuantity'),
    totalSellQty: num(raw, 'totSellQuan', 'totsellquan', 'totalSellQuantity'),
    openInterest: num(raw, 'opnInterest', 'opninterest', 'openInterest'),
    depth: parseDepth(raw.depth ?? raw.Depth),
    exchFeedTime: str(raw, 'exchFeedTime', 'exchfeedtime'),
    exchTradeTime: str(raw, 'exchTradeTime', 'exchtradetime'),
    fetchedAt: fetchedAt.toISOString(),
  }
}

// Fetch one instrument's complete FULL-mode quote. Unlike getQuotes() (which
// trims to PriceSnapshotData for the snapshot cache), this preserves every field
// the research page can display, including the market-depth ladder.
export async function getFullQuote(
  token: string,
  exchange: 'NSE' | 'BSE',
): Promise<FullQuote | null> {
  const client = getSmartApi()
  const fetchedAt = new Date()

  const response = await withRetry(
    async () => {
      const raw = await client.marketData({
        mode: 'FULL',
        exchangeTokens: { [exchange]: [token] },
      })
      if (!raw || raw.status !== true) {
        throw classifyAngelError(raw)
      }
      return raw
    },
    { event: 'angelone.marketData.full' },
  )

  const data = response.data as
    | { fetched?: RawFullRow[]; unfetched?: unknown[] }
    | RawFullRow[]
    | undefined

  let rows: RawFullRow[] = []
  if (Array.isArray(data)) {
    rows = data
  } else if (data && Array.isArray(data.fetched)) {
    rows = data.fetched
  } else {
    throw new NetworkError('Angel One FULL quote response had no rows', response)
  }

  for (const row of rows) {
    const quote = normalizeFullQuote(row, fetchedAt)
    if (quote && quote.token === token) return quote
  }
  // Fall back to the first parseable row (some exchanges echo the token in a
  // different field) so a single-instrument request still yields a quote.
  for (const row of rows) {
    const quote = normalizeFullQuote(row, fetchedAt)
    if (quote) return quote
  }
  return null
}
