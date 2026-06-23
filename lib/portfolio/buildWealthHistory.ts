import { formatInTimeZone } from 'date-fns-tz'

import { getCandles, type CandleData } from '@/lib/angelone/historical'
import { getValidSession } from '@/lib/angelone/session'
import { connectDB } from '@/lib/db/connect'
import { CashAccount } from '@/lib/db/models/CashAccount'
import { Instrument } from '@/lib/db/models/Instrument'
import { Transaction } from '@/lib/db/models/Transaction'
import { buildWealthSeries, type WealthSeriesPoint, type WealthTx } from './wealthSeries'

// Nifty 50 spot index on Angel One. Index candles are served on the NSE segment
// under this synthetic token. If the index can't be fetched we fall back to the
// NIFTYBEES ETF as a close proxy (see resolveNiftyCloses).
const NIFTY_INDEX_TOKEN = '99926000'
const NIFTY_INDEX_EXCHANGE = 'NSE'
const NIFTYBEES_SYMBOL = 'NIFTYBEES-EQ'

export const FD_ANNUAL_RATE = 0.075

// Angel One throttles the historical-candle endpoint to a few requests/second
// and returns HTTP 403 once that is exceeded. Space sequential fetches out to
// stay under the limit, and back off before retrying a throttled token.
const CANDLE_REQUEST_SPACING_MS = 400
const RATE_LIMIT_BACKOFF_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function istDay(date: Date): string {
  return formatInTimeZone(date, 'Asia/Kolkata', 'yyyy-MM-dd')
}

function closesMap(candles: CandleData[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of candles) {
    if (Number.isFinite(c.close)) map.set(istDay(c.timestamp), c.close)
  }
  return map
}

// Fetch daily candles for one token. NEVER throws: any failure returns an empty
// map so a single delisted/illiquid/throttled token can't sink the whole history
// rebuild (which is what was leaving the snapshot collection empty).
//
// Angel One's historical endpoint returns 403 when its per-second rate limit is
// hit, which classifyAngelError surfaces as an AuthError. But the shared session
// is still valid — other tokens succeed with it — so we must NOT invalidate it
// and re-login (doing that per failing token triggers a login storm that then
// gets the login endpoint itself throttled). Instead we just back off and retry
// this one token once, keeping the existing session.
async function fetchCandlesSafe(
  token: string,
  exchange: string,
  from: Date,
  to: Date,
): Promise<CandleData[]> {
  try {
    return await getCandles(token, exchange, 'ONE_DAY', from, to)
  } catch {
    try {
      await sleep(RATE_LIMIT_BACKOFF_MS)
      await getValidSession()
      return await getCandles(token, exchange, 'ONE_DAY', from, to)
    } catch (retryErr) {
      logCandleError(token, retryErr)
      return []
    }
  }
}

function logCandleError(token: string, err: unknown): void {
  console.log(
    JSON.stringify({
      event: 'wealthHistory.candles',
      status: 'error',
      token,
      message: err instanceof Error ? err.message : String(err),
    }),
  )
}

async function resolveNiftyCloses(from: Date, to: Date): Promise<Map<string, number>> {
  const indexCandles = await fetchCandlesSafe(
    NIFTY_INDEX_TOKEN,
    NIFTY_INDEX_EXCHANGE,
    from,
    to,
  )
  if (indexCandles.length > 0) return closesMap(indexCandles)

  // Fallback: NIFTYBEES ETF tracks the Nifty 50 closely enough for a benchmark.
  const etf = await Instrument.findOne({ symbol: NIFTYBEES_SYMBOL })
    .lean<{ token?: string; exchange?: string }>()
  if (etf?.token) {
    console.log(
      JSON.stringify({ event: 'wealthHistory.nifty', status: 'etf-fallback' }),
    )
    const etfCandles = await fetchCandlesSafe(
      etf.token,
      etf.exchange ?? 'NSE',
      from,
      to,
    )
    return closesMap(etfCandles)
  }

  console.log(JSON.stringify({ event: 'wealthHistory.nifty', status: 'unavailable' }))
  return new Map()
}

/**
 * Rebuild the entire daily wealth history from the transaction ledger plus
 * fetched price history. Self-contained: opens the DB, ensures an Angel One
 * session, fetches daily candles for every traded instrument and for Nifty, and
 * returns the four-line series. Returns [] when there are no transactions.
 */
export async function buildWealthHistory(): Promise<WealthSeriesPoint[]> {
  await connectDB()

  const txDocs = (await Transaction.find(
    {},
    { instrumentToken: 1, type: 1, quantity: 1, price: 1, date: 1, charges: 1, _id: 0 },
  )
    .sort({ date: 1 })
    .lean()) as unknown as WealthTx[]

  if (txDocs.length === 0) return []

  const firstTxTime = Math.min(
    ...txDocs.map((t) => new Date(t.date).getTime()),
  )
  // Start a few days early so the first trading day is covered even if the first
  // purchase landed on a market holiday.
  const from = new Date(firstTxTime - 5 * 24 * 60 * 60 * 1000)
  const to = new Date()

  const tokens = Array.from(new Set(txDocs.map((t) => t.instrumentToken)))

  const [instruments, cashAccount] = await Promise.all([
    Instrument.find(
      { token: { $in: tokens } },
      { token: 1, exchange: 1, _id: 0 },
    ).lean<{ token: string; exchange?: string }[]>(),
    CashAccount.findOne({ key: 'default' }).lean<{ fundsAdded?: number } | null>(),
  ])

  const exchangeByToken = new Map<string, string>()
  for (const inst of instruments) {
    if (inst.token) exchangeByToken.set(inst.token, inst.exchange ?? 'NSE')
  }

  // One Angel One session covers every candle fetch below.
  await getValidSession()

  const closesByToken = new Map<string, Map<string, number>>()
  for (const token of tokens) {
    const exchange = exchangeByToken.get(token) ?? 'NSE'
    const candles = await fetchCandlesSafe(token, exchange, from, to)
    closesByToken.set(token, closesMap(candles))
    // Stay under Angel One's historical rate limit between tokens.
    await sleep(CANDLE_REQUEST_SPACING_MS)
  }

  const niftyCloses = await resolveNiftyCloses(from, to)

  // Master axis = Nifty's trading calendar. If Nifty is unavailable, fall back to
  // the union of every holding's trading days so the other three lines still draw.
  const dateSet = new Set<string>(niftyCloses.keys())
  if (dateSet.size === 0) {
    for (const closes of closesByToken.values()) {
      for (const day of closes.keys()) dateSet.add(day)
    }
  }
  const tradingDates = Array.from(dateSet).sort()

  return buildWealthSeries({
    transactions: txDocs,
    tradingDates,
    closesByToken,
    niftyCloses,
    fundsAdded: cashAccount?.fundsAdded ?? 0,
    fdAnnualRate: FD_ANNUAL_RATE,
  })
}
