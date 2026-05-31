import { NextResponse } from 'next/server'

import { verifyCronRequest } from '@/lib/auth/cron'
import { connectDB } from '@/lib/db/connect'
import { PortfolioSnapshot } from '@/lib/db/models/PortfolioSnapshot'
import { Transaction } from '@/lib/db/models/Transaction'
import { computeHoldings, type TransactionForHoldings } from '@/lib/portfolio/holdings'
import { computeSummary } from '@/lib/portfolio/summary'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'

export const dynamic = 'force-dynamic'

function midnightUtcToday(): Date {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
}

export async function GET(request: Request) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status })
  }

  await connectDB()

  const transactions = (await Transaction.find({})
    .sort({ date: 1 })
    .lean()) as unknown as TransactionForHoldings[]

  const holdings = computeHoldings(transactions)
  const tokens = holdings.map((h) => h.instrumentToken)
  const snapshots = await loadSnapshotsForTokens(tokens)
  const summary = computeSummary(holdings, snapshots)

  const date = midnightUtcToday()
  await PortfolioSnapshot.findOneAndUpdate(
    { date },
    {
      $set: {
        date,
        totalValue: summary.totalCurrentValue,
        totalInvested: summary.totalInvested,
        unrealizedPnL: summary.totalUnrealizedPnL,
        realizedPnL: summary.totalRealizedPnL,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  return NextResponse.json({
    status: 'ok',
    date: date.toISOString(),
    summary: {
      totalValue: summary.totalCurrentValue,
      totalInvested: summary.totalInvested,
      unrealizedPnL: summary.totalUnrealizedPnL,
      realizedPnL: summary.totalRealizedPnL,
    },
  })
}
