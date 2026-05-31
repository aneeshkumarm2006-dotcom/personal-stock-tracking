import { NextResponse } from 'next/server'

import { searchInstruments } from '@/lib/angelone/scripMaster'
import { connectDB } from '@/lib/db/connect'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (q.length < 2) {
    return NextResponse.json(
      { error: 'Query parameter "q" must be at least 2 characters' },
      { status: 400 },
    )
  }

  await connectDB()
  const results = await searchInstruments(q)
  return NextResponse.json(
    results.map((r) => ({
      token: r.token,
      symbol: r.symbol,
      name: r.name ?? r.symbol,
      exchange: r.exchange,
    })),
  )
}
