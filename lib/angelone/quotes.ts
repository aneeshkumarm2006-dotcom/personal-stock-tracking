import { getSmartApi, withRetry } from './client'
import { AuthError, NetworkError, RateLimitError, classifyAngelError } from './errors'
import { getCandles, isCandleFresh } from './historical'

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
  // Extra FULL-quote fields. The quote is already fetched in FULL mode every
  // cycle; these used to be discarded. They power the quote-derived advanced
  // alert conditions (volume spike, 52-week breakout, circuit).
  tradeVolume?: number
  week52High?: number
  week52Low?: number
  upperCircuit?: number
  lowerCircuit?: number
  avgPrice?: number
  fetchedAt: Date
}

// Angel One's FULL rows use mixed key casing and 52-week keys that start with a
// digit, so RawQuoteRow is intentionally loose and every field is read across
// casing variants (mirroring lib/angelone/fullQuote.ts).
type RawQuoteRow = Record<string, unknown>

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

// First finite number found across the given keys (defensive multi-casing read).
function pickNumber(row: RawQuoteRow, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const n = toNumber(row[key])
    if (n !== undefined) return n
  }
  return undefined
}

function pickString(row: RawQuoteRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = row[key]
    if (typeof v === 'string' && v.length > 0) return v
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

function normalize(row: RawQuoteRow, fetchedAt: Date): PriceSnapshotData | null {
  const token = pickString(row, 'symbolToken', 'symboltoken', 'token')
  if (!token) return null

  return {
    token,
    symbol: pickString(row, 'tradingSymbol', 'tradingsymbol', 'symbol'),
    exchange: pickString(row, 'exchange'),
    ltp: pickNumber(row, 'ltp'),
    open: pickNumber(row, 'open'),
    high: pickNumber(row, 'high'),
    low: pickNumber(row, 'low'),
    close: pickNumber(row, 'close'),
    netChange: pickNumber(row, 'netChange', 'netchange'),
    pctChange: pickNumber(row, 'percentChange', 'percentchange', 'pChange'),
    tradeVolume: pickNumber(row, 'tradeVolume', 'tradevolume', 'volume'),
    week52High: pickNumber(row, '52WeekHigh', '52weekHigh', 'weekHigh52'),
    week52Low: pickNumber(row, '52WeekLow', '52weekLow', 'weekLow52'),
    upperCircuit: pickNumber(row, 'upperCircuit', 'uppercircuit'),
    lowerCircuit: pickNumber(row, 'lowerCircuit', 'lowercircuit'),
    avgPrice: pickNumber(row, 'avgPrice', 'avgprice'),
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

  // Some instruments — notably NSE Trade-to-Trade (-BE/-BZ) series scrips — the
  // quote endpoint refuses to price: they come back in `unfetched` with errorCode
  // AB4030 ("Unable to fetch market data") in every mode, even though their daily
  // candles are available. Without this, a held BE stock's snapshot freezes at the
  // last time the quote happened to succeed, so its current value / P&L goes stale
  // while its (candle-fed) price chart stays correct. Backfill any requested token
  // the quote omitted with its latest daily candle close.
  const fallbacks = await fetchCandleFallbacks(exchangeTokens, result, fetchedAt)
  return [...result, ...fallbacks]
}

// Look back far enough to always span at least two trading sessions across
// weekends/holidays, so the fallback can also derive a day-change (last vs prev
// close).
const CANDLE_FALLBACK_LOOKBACK_DAYS = 10
// A single quote request should never fan out into an unbounded burst of
// historical calls; cap it so a wholesale quote outage can't hammer the candle
// endpoint. Anything beyond the cap is logged, not silently dropped.
const MAX_CANDLE_FALLBACKS = 25
// Angel One's historical (candle) endpoint throttles bursts far more tightly
// than the quote endpoint — sustained calls need ~1.5s spacing, and an over-eager
// one comes back as an HTTP 403 that classifyAngelError surfaces as AuthError.
// Space the fallback's *network* calls out, and retry a throttled one once, so a
// handful of BE-series holdings don't trip the limit and lose their price. The
// quote itself already succeeded above, so a 403 here means throttling, not an
// expired session. Cache hits (see isCandleFresh) skip the spacing entirely, so
// the 15s portfolio poller only pays this cost on the first tick of each 5-minute
// candle-cache window.
const CANDLE_FALLBACK_SPACING_MS = 1500
const CANDLE_FALLBACK_BACKOFF_MS = 1500
// Hard wall-clock cap on the whole fallback phase, so even a pathological run
// (many uncached tokens all throttling) can't stall a quote request indefinitely.
const CANDLE_FALLBACK_BUDGET_MS = 8000

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requestedPairs(tokens: ExchangeTokens): Array<['NSE' | 'BSE', string]> {
  const pairs: Array<['NSE' | 'BSE', string]> = []
  for (const t of tokens.NSE ?? []) pairs.push(['NSE', t])
  for (const t of tokens.BSE ?? []) pairs.push(['BSE', t])
  return pairs
}

function candleToSnapshot(
  token: string,
  exchange: 'NSE' | 'BSE',
  candles: Awaited<ReturnType<typeof getCandles>>,
  fetchedAt: Date,
): PriceSnapshotData | null {
  if (candles.length === 0) return null
  const last = candles[candles.length - 1]!
  const prev = candles.length >= 2 ? candles[candles.length - 2] : undefined
  const netChange = prev ? round2(last.close - prev.close) : undefined
  const pctChange =
    prev && prev.close ? round2(((last.close - prev.close) / prev.close) * 100) : undefined
  return {
    token,
    exchange,
    ltp: last.close,
    open: last.open,
    high: last.high,
    low: last.low,
    // `close` carries the *previous* session's close (not today's), matching what
    // the quote endpoint returns, so enrichHoldings' day-change math is identical
    // for quote- and candle-sourced snapshots.
    close: prev?.close,
    netChange,
    pctChange,
    // Candle volume is the session's total, same as the quote's tradeVolume, so a
    // volume alert on a candle-fed (BE-series) stock still has a numerator. The
    // 52-week / circuit fields aren't available from candles and stay undefined
    // (those conditions skip on missing data).
    tradeVolume: Number.isFinite(last.volume) ? last.volume : undefined,
    fetchedAt,
  }
}

// One instrument's candle-close fallback, with a single throttle-aware retry.
async function fetchOneCandleFallback(
  token: string,
  exchange: 'NSE' | 'BSE',
  from: Date,
  to: Date,
): Promise<PriceSnapshotData | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const candles = await getCandles(token, exchange, 'ONE_DAY', from, to)
      return candleToSnapshot(token, exchange, candles, to)
    } catch (err) {
      // A 403 here (AuthError) is the historical endpoint throttling us, not a
      // dead session — back off once and retry before giving up on this token.
      const throttled = err instanceof RateLimitError || err instanceof AuthError
      if (throttled && attempt === 1) {
        await sleep(CANDLE_FALLBACK_BACKOFF_MS)
        continue
      }
      console.log(
        JSON.stringify({
          event: 'angelone.marketData',
          status: 'fallback-error',
          token,
          throttled,
          message: err instanceof Error ? err.message : String(err),
        }),
      )
      return null
    }
  }
  return null
}

async function fetchCandleFallbacks(
  exchangeTokens: ExchangeTokens,
  fetched: PriceSnapshotData[],
  fetchedAt: Date,
): Promise<PriceSnapshotData[]> {
  const have = new Set(fetched.map((s) => s.token))
  const missing = requestedPairs(exchangeTokens).filter(([, token]) => !have.has(token))
  if (missing.length === 0) return []

  const attempted = missing.slice(0, MAX_CANDLE_FALLBACKS)
  if (missing.length > attempted.length) {
    console.log(
      JSON.stringify({
        event: 'angelone.marketData',
        status: 'fallback-capped',
        missing: missing.length,
        attempted: attempted.length,
      }),
    )
  }

  const from = new Date(
    fetchedAt.getTime() - CANDLE_FALLBACK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  )
  const startedAt = Date.now()
  const out: PriceSnapshotData[] = []
  let networkCallMade = false
  for (let i = 0; i < attempted.length; i++) {
    const [exchange, token] = attempted[i]!
    const willHitNetwork = !isCandleFresh(token, exchange, 'ONE_DAY', from, fetchedAt)

    if (willHitNetwork && Date.now() - startedAt > CANDLE_FALLBACK_BUDGET_MS) {
      console.log(
        JSON.stringify({
          event: 'angelone.marketData',
          status: 'fallback-budget-exhausted',
          skipped: attempted.length - i,
        }),
      )
      break
    }
    // Only pace before an actual network call, and only once we've already made
    // one — cached tokens cost nothing, so an all-cached poll adds no latency.
    if (willHitNetwork && networkCallMade) await sleep(CANDLE_FALLBACK_SPACING_MS)

    const snap = await fetchOneCandleFallback(token, exchange, from, fetchedAt)
    if (snap) out.push(snap)
    if (willHitNetwork) networkCallMade = true
  }
  return out
}
