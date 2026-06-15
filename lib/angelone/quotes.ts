import { getSmartApi, withRetry } from './client'
import { NetworkError, classifyAngelError } from './errors'

export type QuoteMode = 'FULL' | 'LTP'

export type ExchangeTokens = {
  NSE?: string[]
  BSE?: string[]
}

export type PriceSnapshotData = {
  token: string
  symbol?: string
  exchange?: string
  ltp?: number
  open?: number
  high?: number
  low?: number
  close?: number
  netChange?: number
  pctChange?: number
  fetchedAt: Date
}

type RawQuoteRow = {
  exchange?: string
  tradingSymbol?: string
  tradingsymbol?: string
  symbolToken?: string
  symboltoken?: string
  ltp?: number | string
  open?: number | string
  high?: number | string
  low?: number | string
  close?: number | string
  netChange?: number | string
  percentChange?: number | string
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

function normalize(row: RawQuoteRow, fetchedAt: Date): PriceSnapshotData | null {
  const token = row.symbolToken ?? row.symboltoken
  if (!token) return null

  return {
    token: String(token),
    symbol: row.tradingSymbol ?? row.tradingsymbol,
    exchange: row.exchange,
    ltp: toNumber(row.ltp),
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    netChange: toNumber(row.netChange),
    pctChange: toNumber(row.percentChange),
    fetchedAt,
  }
}

function isEmpty(tokens: ExchangeTokens): boolean {
  const nse = tokens.NSE?.length ?? 0
  const bse = tokens.BSE?.length ?? 0
  return nse + bse === 0
}

// Angel One's quote endpoint accepts at most 50 tokens per request (counted
// across all exchanges). Split the requested tokens into batches that respect
// this cap so a large, fully-live watchlist doesn't silently drop quotes.
const MAX_TOKENS_PER_REQUEST = 50

function chunkExchangeTokens(tokens: ExchangeTokens): ExchangeTokens[] {
  // Flatten to (exchange, token) pairs, then re-group into batches of <=50.
  const pairs: Array<['NSE' | 'BSE', string]> = []
  for (const t of tokens.NSE ?? []) pairs.push(['NSE', t])
  for (const t of tokens.BSE ?? []) pairs.push(['BSE', t])

  const batches: ExchangeTokens[] = []
  for (let i = 0; i < pairs.length; i += MAX_TOKENS_PER_REQUEST) {
    const slice = pairs.slice(i, i + MAX_TOKENS_PER_REQUEST)
    const batch: ExchangeTokens = {}
    for (const [exchange, token] of slice) {
      ;(batch[exchange] ??= []).push(token)
    }
    batches.push(batch)
  }
  return batches
}

async function fetchBatch(
  payload: Record<string, string[]>,
  mode: QuoteMode,
  fetchedAt: Date,
): Promise<PriceSnapshotData[]> {
  const client = getSmartApi()

  const response = await withRetry(
    async () => {
      const raw = await client.marketData({ mode, exchangeTokens: payload })
      if (!raw || raw.status !== true) {
        throw classifyAngelError(raw)
      }
      return raw
    },
    { event: 'angelone.marketData' },
  )

  const data = response.data as
    | { fetched?: RawQuoteRow[]; unfetched?: unknown[] }
    | RawQuoteRow[]
    | undefined

  let rows: RawQuoteRow[] = []
  if (Array.isArray(data)) {
    rows = data
  } else if (data && Array.isArray(data.fetched)) {
    rows = data.fetched
    if (Array.isArray(data.unfetched) && data.unfetched.length > 0) {
      console.log(
        JSON.stringify({
          event: 'angelone.marketData',
          status: 'partial',
          unfetched: data.unfetched.length,
        }),
      )
    }
  } else {
    throw new NetworkError('Angel One marketData response had no fetched rows', response)
  }

  const result: PriceSnapshotData[] = []
  for (const row of rows) {
    const snap = normalize(row, fetchedAt)
    if (snap) result.push(snap)
  }
  return result
}

export async function getQuotes(
  exchangeTokens: ExchangeTokens,
  mode: QuoteMode,
): Promise<PriceSnapshotData[]> {
  if (isEmpty(exchangeTokens)) return []

  const batches = chunkExchangeTokens(exchangeTokens)
  const fetchedAt = new Date()

  // Run batches sequentially: a single account rarely needs more than one batch,
  // and sequencing keeps us comfortably under the per-second quote rate limit.
  const result: PriceSnapshotData[] = []
  for (const batch of batches) {
    const payload: Record<string, string[]> = {}
    if (batch.NSE?.length) payload.NSE = batch.NSE
    if (batch.BSE?.length) payload.BSE = batch.BSE
    result.push(...(await fetchBatch(payload, mode, fetchedAt)))
  }
  return result
}
