import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { Transaction } from '@/lib/db/models/Transaction'
import { computeHoldings, type TransactionForHoldings } from '@/lib/portfolio/holdings'
import { enrichHoldings } from '@/lib/portfolio/summary'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'

export const dynamic = 'force-dynamic'

export async function GET() {
  await connectDB()

  const transactions = (await Transaction.find({})
    .sort({ date: 1 })
    .lean()) as unknown as TransactionForHoldings[]

  const holdings = computeHoldings(transactions)
  const tokens = holdings.map((h) => h.instrumentToken)
  const snapshots = await loadSnapshotsForTokens(tokens)
  const enriched = enrichHoldings(holdings, snapshots)

  let oldestFetchedAt: Date | null = null
  for (const h of enriched) {
    if (!h.isClosed && h.snapshotFetchedAt) {
      if (!oldestFetchedAt || h.snapshotFetchedAt < oldestFetchedAt) {
        oldestFetchedAt = h.snapshotFetchedAt
      }
    }
  }

  return NextResponse.json({
    holdings: enriched,
    oldestFetchedAt: oldestFetchedAt?.toISOString() ?? null,
  })
}
