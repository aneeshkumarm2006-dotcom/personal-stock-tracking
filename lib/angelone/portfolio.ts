import { getValidSession } from './session'
import { getSmartApi, withRetry, type SmartApiResponse } from './client'
import { NetworkError, classifyAngelError } from './errors'

// One equity holding as reported by Angel One's getAllHolding endpoint. Only the
// fields the reconciler needs are surfaced; quantity is the *total* held
// (settled + T1) and averageprice is Angel's running average for the remaining
// lots.
export type AngelHolding = {
  token: string
  symbol: string
  exchange: 'NSE' | 'BSE'
  quantity: number
  averagePrice: number
  ltp: number
}

// One executed fill from today's trade book. Used to recover the *exact* price a
// detected holding change traded at (getAllHolding only gives a running average).
export type AngelTrade = {
  token: string
  symbol: string
  type: 'BUY' | 'SELL'
  price: number
  quantity: number
  // Raw HH:MM:SS fill time as returned by Angel (IST). Kept for notes only.
  fillTime: string
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function pickExchange(value: unknown): 'NSE' | 'BSE' | null {
  return value === 'NSE' || value === 'BSE' ? value : null
}

async function callAuthorized<T>(
  event: string,
  fn: () => Promise<SmartApiResponse<T>>,
): Promise<SmartApiResponse<T>> {
  // Refresh/apply the session tokens to the shared client before every call so
  // a stale JWT is rotated rather than returning an auth error.
  await getValidSession()
  return withRetry(
    async () => {
      const raw = await fn()
      if (!raw || raw.status !== true) {
        throw classifyAngelError(raw)
      }
      return raw
    },
    { event },
  )
}

type RawHolding = {
  symboltoken?: string
  tradingsymbol?: string
  exchange?: string
  quantity?: number | string
  averageprice?: number | string
  ltp?: number | string
}

// Fetch all equity holdings. getAllHolding returns { holdings, totalholding };
// the older getHolding shape is a bare array — handle both defensively.
export async function fetchAngelHoldings(): Promise<AngelHolding[]> {
  const response = await callAuthorized('angelone.getAllHolding', () =>
    getSmartApi().getAllHolding(),
  )

  const data = response.data as
    | { holdings?: RawHolding[] }
    | RawHolding[]
    | null
    | undefined
  const rows: RawHolding[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.holdings)
      ? data.holdings
      : []

  const result: AngelHolding[] = []
  for (const row of rows) {
    const token = row.symboltoken ? String(row.symboltoken) : ''
    const exchange = pickExchange(row.exchange)
    if (!token || !exchange) continue
    result.push({
      token,
      symbol: row.tradingsymbol ?? '',
      exchange,
      quantity: Math.trunc(toNumber(row.quantity)),
      averagePrice: toNumber(row.averageprice),
      ltp: toNumber(row.ltp),
    })
  }
  return result
}

type RawFunds = {
  availablecash?: number | string
  net?: number | string
}

// Available trading-account cash from the RMS endpoint. Returns null (rather than
// throwing) when the field is absent so a sync can still proceed without
// re-anchoring cash.
export async function fetchAngelFunds(): Promise<{ availableCash: number } | null> {
  const response = await callAuthorized('angelone.getRMS', () => getSmartApi().getRMS())
  const data = response.data as RawFunds | null | undefined
  if (!data) return null
  const raw = data.availablecash ?? data.net
  if (raw === undefined || raw === null || raw === '') return null
  return { availableCash: toNumber(raw) }
}

type RawTrade = {
  symboltoken?: string
  tradingsymbol?: string
  transactiontype?: string
  fillprice?: number | string
  fillsize?: number | string
  filltime?: string
}

// Today's executed fills. Best-effort: an empty book is a valid result (no trades
// today), so callers treat a thrown error as "trade book unavailable" and fall
// back to average/LTP pricing.
export async function fetchAngelTradeBook(): Promise<AngelTrade[]> {
  const response = await callAuthorized('angelone.getTradeBook', () =>
    getSmartApi().getTradeBook(),
  )
  const data = response.data as RawTrade[] | null | undefined
  if (!Array.isArray(data)) return []

  const result: AngelTrade[] = []
  for (const row of data) {
    const token = row.symboltoken ? String(row.symboltoken) : ''
    const type = row.transactiontype === 'BUY' || row.transactiontype === 'SELL' ? row.transactiontype : null
    const quantity = Math.trunc(toNumber(row.fillsize))
    const price = toNumber(row.fillprice)
    if (!token || !type || quantity <= 0 || price <= 0) continue
    result.push({
      token,
      symbol: row.tradingsymbol ?? '',
      type,
      price,
      quantity,
      fillTime: row.filltime ?? '',
    })
  }
  return result
}

export { NetworkError }
