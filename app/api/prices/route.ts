import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { PriceSnapshot } from '@/lib/db/models/PriceSnapshot'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  await connectDB()

  const { searchParams } = new URL(request.url)
  const tokensRaw = searchParams.get('tokens')

  if (!tokensRaw) {
    return NextResponse.json(
      { error: 'Query parameter "tokens" is required' },
      { status: 400 },
    )
  }

  const tokens = tokensRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return NextResponse.json([])
  }

  const snapshots = await PriceSnapshot.find({ token: { $in: tokens } }).lean()
  return NextResponse.json(snapshots)
}
