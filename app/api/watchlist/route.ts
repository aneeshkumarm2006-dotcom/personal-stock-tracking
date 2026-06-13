import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { WatchlistItem } from '@/lib/db/models/WatchlistItem'
import { normalizeTags } from '@/lib/portfolio/tags'
import {
  collectOpenHoldingTokens,
  collectStrategyTokens,
} from '@/lib/prices/refresh'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'
import { enrichWatchlistItems, type RawWatchlistItem } from '@/lib/watchlist/enrich'
import { watchlistItemSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

// List every watchlist item, enriched with the latest price snapshot (LTP, day
// change, distance-to-target) and "in portfolio / in strategy" flags. Mirrors
// the enrichment in /api/holdings.
export async function GET() {
  await connectDB()

  const items = (await WatchlistItem.find({})
    .sort({ createdAt: -1 })
    .lean()) as unknown as RawWatchlistItem[]

  const tokens = items.map((i) => i.instrumentToken)
  const [snapshots, portfolioTokens, strategyTokens] = await Promise.all([
    loadSnapshotsForTokens(tokens),
    collectOpenHoldingTokens(),
    collectStrategyTokens(),
  ])

  const enriched = enrichWatchlistItems(
    items,
    snapshots,
    portfolioTokens,
    strategyTokens,
  )

  let oldest: string | null = null
  for (const e of enriched) {
    if (e.snapshotFetchedAt && (!oldest || e.snapshotFetchedAt < oldest)) {
      oldest = e.snapshotFetchedAt
    }
  }

  return NextResponse.json({ items: enriched, oldestFetchedAt: oldest })
}

// Add an instrument to the watchlist.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = watchlistItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  await connectDB()

  const existing = await WatchlistItem.findOne({
    instrumentToken: parsed.data.instrumentToken,
  }).lean()
  if (existing) {
    return NextResponse.json(
      { error: 'Already on watchlist' },
      { status: 409 },
    )
  }

  const created = await WatchlistItem.create({
    ...parsed.data,
    tags: normalizeTags(parsed.data.tags),
  })

  return NextResponse.json(created.toJSON(), { status: 201 })
}
