import { NextResponse } from 'next/server'

import { AuthError } from '@/lib/angelone/errors'
import { runHoldingsSync } from '@/lib/portfolio/syncHoldings'

export const dynamic = 'force-dynamic'

// Manual "Sync from Angel One" action. Session-protected by middleware.
//   GET  /api/portfolio/sync           -> preview (dry run), writes nothing
//   POST /api/portfolio/sync           -> apply: write transactions + anchor cash
//   POST /api/portfolio/sync?dryRun=1  -> preview via POST as well
//
// The reconciliation is idempotent: running it twice with no Angel-side change
// produces zero transactions, so an accidental double-apply is harmless.
export async function GET() {
  return run(true)
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === '1' || searchParams.get('dryRun') === 'true'
  return run(dryRun)
}

async function run(dryRun: boolean) {
  try {
    const result = await runHoldingsSync({ dryRun })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: 'Angel One authentication failed. Check your credentials.' },
        { status: 502 },
      )
    }
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
