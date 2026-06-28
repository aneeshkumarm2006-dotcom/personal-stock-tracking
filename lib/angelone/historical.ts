import { formatInTimeZone } from 'date-fns-tz'

import { getSmartApi, withRetry } from './client'
import { NetworkError, classifyAngelError } from './errors'

// Angel One's getCandleData accepts these 8 interval enums. Each has a documented
// "max days per request" cap (ONE_MINUTE=30 … ONE_DAY=2000) — callers must keep
// their from/to window within it or the endpoint errors. See CANDLE_MAX_DAYS.
export type CandleInterval =
  | 'ONE_MINUTE'
  | 'THREE_MINUTE'
  | 'FIVE_MINUTE'
  | 'TEN_MINUTE'
  | 'FIFTEEN_MINUTE'
  | 'THIRTY_MINUTE'
  | 'ONE_HOUR'
  | 'ONE_DAY'

export const CANDLE_MAX_DAYS: Record<CandleInterval, number> = {
  ONE_MINUTE: 30,
  THREE_MINUTE: 60,
  FIVE_MINUTE: 100,
  TEN_MINUTE: 100,
  FIFTEEN_MINUTE: 200,
  THIRTY_MINUTE: 200,
  ONE_HOUR: 400,
  ONE_DAY: 2000,
}

export type CandleData = {
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type CacheEntry = {
  data: CandleData[]
  expiresAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000
const candleCache = new Map<string, CacheEntry>()

function cacheKey(
  token: string,
  exchange: string,
  interval: CandleInterval,
  fromDate: Date,
  toDate: Date,
): string {
  return `${exchange}-${token}-${interval}-${fromDate.toDateString()}-${toDate.toDateString()}`
}

function formatIst(date: Date): string {
  return formatInTimeZone(date, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm')
}

function parseRow(row: Array<string | number>): CandleData | null {
  if (!Array.isArray(row) || row.length < 6) return null
  const [ts, open, high, low, close, volume] = row
  const timestamp = ts ? new Date(ts as string) : null
  if (!timestamp || Number.isNaN(timestamp.getTime())) return null
  return {
    timestamp,
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
  }
}

export function clearCandleCache(): void {
  candleCache.clear()
}

export async function getCandles(
  token: string,
  exchange: string,
  interval: CandleInterval,
  fromDate: Date,
  toDate: Date,
): Promise<CandleData[]> {
  const key = cacheKey(token, exchange, interval, fromDate, toDate)
  const cached = candleCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const client = getSmartApi()

  const response = await withRetry(
    async () => {
      const raw = await client.getCandleData({
        exchange,
        symboltoken: token,
        interval,
        fromdate: formatIst(fromDate),
        todate: formatIst(toDate),
      })
      if (!raw || raw.status !== true) {
        throw classifyAngelError(raw)
      }
      return raw
    },
    { event: 'angelone.getCandleData' },
  )

  const rawRows = response.data
  if (!Array.isArray(rawRows)) {
    throw new NetworkError('Angel One getCandleData response had no rows', response)
  }

  const candles: CandleData[] = []
  for (const row of rawRows) {
    const parsed = parseRow(row)
    if (parsed) candles.push(parsed)
  }

  candleCache.set(key, { data: candles, expiresAt: Date.now() + CACHE_TTL_MS })
  return candles
}
