import { NextResponse } from 'next/server'

import { verifyCronRequest } from '@/lib/auth/cron'
import { connectDB } from '@/lib/db/connect'
import { PortfolioSnapshot } from '@/lib/db/models/PortfolioSnapshot'
import { buildWealthHistory } from '@/lib/portfolio/buildWealthHistory'

export const dynamic = 'force-dynamic'
// Rebuilding the full history fetches throttled Angel One candles for every
// traded token (sequentially, with rate-limit spacing/back-off), so the job can
// run ~40s+. Raise the timeout well above Vercel's short default, which would
// otherwise kill the function before it upserts anything.
export const maxDuration = 60

// Rebuild the full daily wealth history (cash / investment / Nifty / FD) from the
// ledger and price history, then upsert every day. The rebuild is idempotent, so
// running it daily both appends today's point and self-heals any past gaps.
export async function GET(request: Request) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status })
  }

  await connectDB()

  const series = await buildWealthHistory()

  if (series.length === 0) {
    return NextResponse.json({ status: 'ok', upserted: 0 })
  }

  await PortfolioSnapshot.bulkWrite(
    series.map((point) => ({
      updateOne: {
        filter: { date: new Date(`${point.date}T00:00:00.000Z`) },
        update: {
          $set: {
            date: new Date(`${point.date}T00:00:00.000Z`),
            cash: point.cash,
            investmentValue: point.investmentValue,
            niftyValue: point.niftyValue,
            fdValue: point.fdValue,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  )

  const last = series[series.length - 1]
  return NextResponse.json({
    status: 'ok',
    upserted: series.length,
    from: series[0]?.date,
    to: last?.date,
    latest: last,
  })
}
