import { NextResponse } from 'next/server'

import {
  IndianApiAuthError,
  IndianApiRateLimitError,
} from '@/lib/indianapi/client'
import {
  FundamentalsNotFoundError,
  getFundamentals,
} from '@/lib/indianapi/fundamentals'

export const dynamic = 'force-dynamic'

// Company fundamentals for the Research page, sourced from indianapi.in and
// reshaped server-side (the raw payload is ~350KB; we never ship it to the
// client). Resolves the provider's company by the Angel One symbol, falling
// back to the display name. Mirrors the error contract of /api/quote/full.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') ?? '').trim()
  const name = (searchParams.get('name') ?? '').trim()

  if (!symbol && !name) {
    return NextResponse.json(
      { error: 'Query parameter "symbol" or "name" is required' },
      { status: 400 },
    )
  }

  try {
    const data = await getFundamentals({ symbol, name })
    return NextResponse.json(data, {
      // The lib caches in-process for 12h; let the browser reuse a result for a
      // few minutes too so re-opening a stock is instant.
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (err) {
    if (err instanceof FundamentalsNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof IndianApiRateLimitError) {
      return NextResponse.json(
        { error: 'Fundamentals provider rate limit reached — try again shortly' },
        { status: 503 },
      )
    }
    if (err instanceof IndianApiAuthError) {
      return NextResponse.json(
        { error: 'Fundamentals provider rejected the API key' },
        { status: 502 },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    console.log(
      JSON.stringify({ event: 'fundamentals.fetch', status: 'error', symbol, name, message }),
    )
    return NextResponse.json({ error: 'Failed to load fundamentals' }, { status: 502 })
  }
}
