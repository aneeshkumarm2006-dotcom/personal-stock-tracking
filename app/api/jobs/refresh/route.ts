import { NextResponse } from 'next/server'

import { verifyCronRequest } from '@/lib/auth/cron'
import { runRefreshCycle } from '@/lib/prices/refresh'
import { isMarketOpen } from '@/lib/time/marketHours'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status })
  }

  if (!isMarketOpen()) {
    return NextResponse.json({ status: 'market_closed' })
  }

  // Background job: the site may be closed, so only keep the always-important
  // surfaces warm — watchlist, strategy, and alerts. Portfolio holdings are
  // skipped here; they're refreshed on demand by the Refresh button / live page
  // pollers when someone actually has the site open.
  const result = await runRefreshCycle({ includeHoldings: false })
  return NextResponse.json({ status: 'ok', result })
}
