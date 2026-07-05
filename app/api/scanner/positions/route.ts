import { NextResponse } from 'next/server'

import { listPositions } from '@/lib/scanner/queries'
import type { PositionsFilter } from '@/lib/scanner/types'

export const dynamic = 'force-dynamic'

// GET /api/scanner/positions?status=&strategy=&date=
// Thin wrapper over listPositions (which connects + serializes). Returns a bare
// array of serialized positions. Empty/absent query params mean "no filter".
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const filter: PositionsFilter = {}
  const status = searchParams.get('status')
  const strategy = searchParams.get('strategy')
  const date = searchParams.get('date')
  if (status) filter.status = status
  if (strategy) filter.strategy = strategy
  if (date) filter.date = date

  const positions = await listPositions(filter)
  return NextResponse.json(positions)
}
