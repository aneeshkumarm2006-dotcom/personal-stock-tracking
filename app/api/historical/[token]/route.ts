import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCandles } from '@/lib/angelone/historical'

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
  interval: z.enum(['ONE_DAY', 'ONE_WEEK']),
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

  const candles = await getCandles(
    token,
    parsed.data.exchange,
    parsed.data.interval,
    parsed.data.from,
    parsed.data.to,
  )

  return NextResponse.json(candles)
}
