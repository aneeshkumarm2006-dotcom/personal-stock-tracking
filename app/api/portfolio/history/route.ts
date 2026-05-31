import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { PortfolioSnapshot } from '@/lib/db/models/PortfolioSnapshot'

export const dynamic = 'force-dynamic'

const DEFAULT_DAYS = 90
const MAX_DAYS = 365 * 5

export async function GET(request: Request) {
  await connectDB()

  const { searchParams } = new URL(request.url)
  const daysParam = searchParams.get('days')

  let days = DEFAULT_DAYS
  if (daysParam) {
    const parsed = Number.parseInt(daysParam, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: '"days" must be a positive integer' },
        { status: 400 },
      )
    }
    days = Math.min(parsed, MAX_DAYS)
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const snapshots = await PortfolioSnapshot.find({ date: { $gte: since } })
    .sort({ date: 1 })
    .lean()

  return NextResponse.json(snapshots)
}
