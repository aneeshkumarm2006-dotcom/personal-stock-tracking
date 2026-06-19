import { NextResponse } from 'next/server'

import { verifyCronRequest } from '@/lib/auth/cron'
import { runHoldingsSync } from '@/lib/portfolio/syncHoldings'

export const dynamic = 'force-dynamic'

// Daily holdings reconciliation. Runs once after market close so any buys/sells
// done during the day are captured against the day's trade book (exact fill
// prices) and cash is re-anchored to Angel One's real available balance.
export async function GET(request: Request) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status })
  }

  try {
    const result = await runHoldingsSync({ dryRun: false })
    return NextResponse.json({ status: 'ok', result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.log(JSON.stringify({ event: 'jobs.holdings-sync', status: 'error', message }))
    return NextResponse.json({ status: 'error', error: message }, { status: 502 })
  }
}
