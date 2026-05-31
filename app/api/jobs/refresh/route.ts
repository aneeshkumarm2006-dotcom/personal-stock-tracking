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

  const result = await runRefreshCycle()
  return NextResponse.json({ status: 'ok', result })
}
