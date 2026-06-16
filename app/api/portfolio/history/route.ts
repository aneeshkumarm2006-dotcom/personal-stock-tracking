import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { PortfolioSnapshot } from '@/lib/db/models/PortfolioSnapshot'

export const dynamic = 'force-dynamic'

const MAX_DAYS = 365 * 20

// Returns the persisted daily wealth history (cash / investment / Nifty / FD),
// oldest first. With no `days` param (or `days=all`) the full history is returned
// so the chart can show everything; pass a positive integer to window it.
export async function GET(request: Request) {
  await connectDB()

  const { searchParams } = new URL(request.url)
  const daysParam = searchParams.get('days')

  const filter: Record<string, unknown> = {}
  if (daysParam && daysParam !== 'all') {
    const parsed = Number.parseInt(daysParam, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: '"days" must be a positive integer or "all"' },
        { status: 400 },
      )
    }
    const days = Math.min(parsed, MAX_DAYS)
    filter.date = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
  }

  const snapshots = await PortfolioSnapshot.find(filter).sort({ date: 1 }).lean()

  return NextResponse.json(snapshots)
}
