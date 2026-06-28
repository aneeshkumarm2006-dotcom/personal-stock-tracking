import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  CANDLE_MAX_DAYS,
  getCandles,
  type CandleData,
} from '@/lib/angelone/historical'
import { getValidSession, invalidateSession } from '@/lib/angelone/session'
import { AuthError, RateLimitError } from '@/lib/angelone/errors'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

const dateLike = z.preprocess((v) => {
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? v : d
  }
  return v
}, z.date())

const querySchema = z.object({
  exchange: z.enum(['NSE', 'BSE']),
  interval: z.enum([
    'ONE_MINUTE',
    'THREE_MINUTE',
    'FIVE_MINUTE',
    'TEN_MINUTE',
    'FIFTEEN_MINUTE',
    'THIRTY_MINUTE',
    'ONE_HOUR',
    'ONE_DAY',
  ]),
  from: dateLike,
  to: dateLike,
})

export async function GET(request: Request, { params }: RouteContext) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({
    exchange: searchParams.get('exchange'),
    interval: searchParams.get('interval'),
    from: searchParams.get('from'),
    to: searchParams.get('to'),
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  if (parsed.data.from > parsed.data.to) {
    return NextResponse.json(
      { error: '"from" must be on or before "to"' },
      { status: 400 },
    )
  }

  // Angel One rejects windows wider than the interval's max-days cap. Clamp the
  // start so an over-long request (e.g. 5y of 5-minute candles) returns the most
  // recent allowed slice instead of erroring.
  const maxDays = CANDLE_MAX_DAYS[parsed.data.interval]
  const minFrom = new Date(parsed.data.to.getTime() - maxDays * 24 * 60 * 60 * 1000)
  const from = parsed.data.from < minFrom ? minFrom : parsed.data.from

  const fetchCandles = () =>
    getCandles(token, parsed.data.exchange, parsed.data.interval, from, parsed.data.to)

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
      JSON.stringify({ event: 'historical.fetch', status: 'error', token, message }),
    )
    return NextResponse.json(
      { error: 'Failed to load price history' },
      { status: 502 },
    )
  }

  return NextResponse.json(candles)
}
