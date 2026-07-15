import { Transaction } from '@/lib/db/models/Transaction'
import {
  computeHoldings,
  type TransactionForHoldings,
} from '@/lib/portfolio/holdings'
import { enrichHoldings, type EnrichedHolding } from '@/lib/portfolio/summary'
import { loadTagsForTokens } from '@/lib/portfolio/tags'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'

export type HoldingWithTags = EnrichedHolding & { tags: string[] }

export type HoldingsResponse = {
  holdings: HoldingWithTags[]
  oldestFetchedAt: string | null
}

// Single source of truth for the holdings payload the portfolio table/charts
// read. Both the `/api/holdings` route and the server-rendered portfolio page
// call this — the page passes the result to the client as `initialData` so the
// first paint doesn't trigger an immediate refetch of the same computation.
// Caller must have an active DB connection (connectDB) before invoking.
export async function loadHoldingsResponse(): Promise<HoldingsResponse> {
  const transactions = (await Transaction.find({})
    .sort({ date: 1 })
    .lean()) as unknown as TransactionForHoldings[]

  const holdings = computeHoldings(transactions)
  const tokens = holdings.map((h) => h.instrumentToken)
  const [snapshots, tagsByToken] = await Promise.all([
    loadSnapshotsForTokens(tokens),
    loadTagsForTokens(tokens),
  ])
  const enriched: HoldingWithTags[] = enrichHoldings(holdings, snapshots).map(
    (h) => ({
      ...h,
      tags: tagsByToken.get(h.instrumentToken) ?? [],
    }),
  )

  let oldestFetchedAt: Date | null = null
  for (const h of enriched) {
    if (!h.isClosed && h.snapshotFetchedAt) {
      if (!oldestFetchedAt || h.snapshotFetchedAt < oldestFetchedAt) {
        oldestFetchedAt = h.snapshotFetchedAt
      }
    }
  }

  return {
    holdings: enriched,
    oldestFetchedAt: oldestFetchedAt?.toISOString() ?? null,
  }
}
