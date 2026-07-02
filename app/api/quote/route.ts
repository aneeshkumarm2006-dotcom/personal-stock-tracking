import { NextResponse } from 'next/server'

import { AuthError, RateLimitError } from '@/lib/angelone/errors'
import { getQuotes, type ExchangeTokens } from '@/lib/angelone/quotes'
import { getValidSession, invalidateSession } from '@/lib/angelone/session'
import { connectDB } from '@/lib/db/connect'
import { Instrument } from '@/lib/db/models/Instrument'

export const dynamic = 'force-dynamic'

// Live single-instrument quote. Used by the instrument typeahead to show the
// current price right after a stock is picked, before it's saved anywhere. This
// fetches straight from Angel One rather than reading the snapshot cache, since
// a freshly searched instrument usually has no snapshot yet (snapshots only
// cover held/watched/strategy tokens — see lib/prices/refresh.ts).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = (searchParams.get('token') ?? '').trim()
  const exchangeHint = (searchParams.get('exchange') ?? '').trim().toUpperCase()

  if (!token) {
    return NextResponse.json(
      { error: 'Query parameter "token" is required' },
      { status: 400 },
    )
  }

  // The exchange decides which segment Angel One prices. The typeahead knows it
  // when a stock is picked from search, but not when the instrument arrives
  // pre-filled (per-instrument "Add transaction" / edit dialog) — so resolve it
  // from the instrument record, the app's source of truth for a token's
  // exchange. Fall back to the caller's hint, then NSE.
  await connectDB()
  const instrument = await Instrument.findOne({ token }).lean()
  const exchange: 'NSE' | 'BSE' =
    instrument?.exchange === 'BSE' || instrument?.exchange === 'NSE'
      ? instrument.exchange
      : exchangeHint === 'BSE'
        ? 'BSE'
        : 'NSE'
  const grouped: ExchangeTokens = { [exchange]: [token] }

  try {
    // Re-auth once on an expired/invalid JWT, mirroring the refresh cycle.
    await getValidSession()
    let snaps
    try {
      snaps = await getQuotes(grouped, 'FULL')
    } catch (err) {
      if (err instanceof AuthError) {
        await invalidateSession()
        await getValidSession()
        snaps = await getQuotes(grouped, 'FULL')
      } else {
        throw err
      }
    }

    const snap = snaps.find((s) => s.token === token) ?? snaps[0]
    if (!snap) {
      return NextResponse.json({ error: 'No quote available' }, { status: 404 })
    }
    return NextResponse.json(snap)
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
