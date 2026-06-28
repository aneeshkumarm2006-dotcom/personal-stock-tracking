import { NextResponse } from 'next/server'

import { AuthError, RateLimitError } from '@/lib/angelone/errors'
import { getFullQuote } from '@/lib/angelone/fullQuote'
import { getValidSession, invalidateSession } from '@/lib/angelone/session'

export const dynamic = 'force-dynamic'

// Complete FULL-mode quote for the research page: OHLC, 52-week range, circuits,
// volume, total buy/sell quantity, open interest, and the best-5 market-depth
// ladder. The lighter /api/quote endpoint (PriceSnapshotData) backs the
// typeahead; this one preserves everything Angel One returns. Fetches straight
// from Angel One since a freshly searched instrument usually has no snapshot yet.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = (searchParams.get('token') ?? '').trim()
  const exchangeRaw = (searchParams.get('exchange') ?? 'NSE').trim().toUpperCase()

  if (!token) {
    return NextResponse.json(
      { error: 'Query parameter "token" is required' },
      { status: 400 },
    )
  }

  const exchange: 'NSE' | 'BSE' = exchangeRaw === 'BSE' ? 'BSE' : 'NSE'

  try {
    // Re-auth once on an expired/invalid JWT, mirroring /api/quote.
    await getValidSession()
    let quote
    try {
      quote = await getFullQuote(token, exchange)
    } catch (err) {
      if (err instanceof AuthError) {
        await invalidateSession()
        await getValidSession()
        quote = await getFullQuote(token, exchange)
      } else {
        throw err
      }
    }

    if (!quote) {
      return NextResponse.json({ error: 'No quote available' }, { status: 404 })
    }
    return NextResponse.json(quote)
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Rate limited — try again shortly' },
        { status: 503 },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
