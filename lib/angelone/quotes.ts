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

export async function getQuotes(
  exchangeTokens: ExchangeTokens,
  mode: QuoteMode,
): Promise<PriceSnapshotData[]> {
  if (isEmpty(exchangeTokens)) return []

  const payload: Record<string, string[]> = {}
  if (exchangeTokens.NSE?.length) payload.NSE = exchangeTokens.NSE
  if (exchangeTokens.BSE?.length) payload.BSE = exchangeTokens.BSE

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

  const fetchedAt = new Date()
  const data = response.data as { fetched?: RawQuoteRow[] } | RawQuoteRow[] | undefined

  let rows: RawQuoteRow[] = []
  if (Array.isArray(data)) {
    rows = data
  } else if (data && Array.isArray(data.fetched)) {
    rows = data.fetched
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
