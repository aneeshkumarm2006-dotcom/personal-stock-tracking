import { NextResponse } from 'next/server'

import { getCandles, type CandleData } from '@/lib/angelone/historical'
import { getValidSession, invalidateSession } from '@/lib/angelone/session'
import { AuthError, RateLimitError } from '@/lib/angelone/errors'
import { getSignal } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const DAY_MS = 24 * 60 * 60 * 1000
// ~120 calendar days of pre-signal context, and a few sessions of tail after the
// exit so the exit marker never sits flush against the chart's right edge.
const LOOKBACK_DAYS = 120
const EXIT_PAD_DAYS = 5

// Trading dates are YYYY-MM-DD strings. new Date('YYYY-MM-DD') is UTC midnight,
// which is fine for a day-level window (getCandles formats to IST minute anyway).
function parseDay(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params
  const { signal, position } = await getSignal(id)

  if (!signal && !position) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
  }

  const token = signal?.token || position?.token || ''
  if (!token) {
    return NextResponse.json({ error: 'Signal has no token' }, { status: 404 })
  }

  const signalDate =
    parseDay(signal?.date) ?? parseDay(position?.signalDate) ?? new Date()
  const from = new Date(signalDate.getTime() - LOOKBACK_DAYS * DAY_MS)

  // Closed trades bound the window to a few days past the exit; open/pending
  // trades run through today.
  const exitDate = parseDay(position?.exitDate)
  const to = exitDate
    ? new Date(exitDate.getTime() + EXIT_PAD_DAYS * DAY_MS)
    : new Date()

  const fetchCandles = () => getCandles(token, 'NSE', 'ONE_DAY', from, to)

  let candles: CandleData[]
  try {
    await getValidSession()
    try {
      candles = await fetchCandles()
    } catch (err) {
      if (err instanceof AuthError) {
        await invalidateSession()
        await getValidSession()
        candles = await fetchCandles()
      } else {
        throw err
      }
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Rate limited by data provider — try again shortly' },
        { status: 503 },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    console.log(
      JSON.stringify({
        event: 'scanner.candles',
        status: 'error',
        id,
        token,
        message,
      }),
    )
    return NextResponse.json(
      { error: 'Failed to load price history' },
      { status: 502 },
    )
  }

  const rows = candles.map((c) => ({
    timestamp: c.timestamp.toISOString(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }))

  return NextResponse.json(rows)
}
