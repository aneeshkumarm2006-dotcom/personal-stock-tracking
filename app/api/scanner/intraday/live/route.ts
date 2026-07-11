import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { ScannerIntradayLiveModel } from '@/lib/scanner/models'

export const dynamic = 'force-dynamic'

// Latest live-session doc (the Python live runner upserts _id = session date).
// The client panel polls this while the market is open.
export async function GET() {
  await connectDB()
  const doc = await ScannerIntradayLiveModel.findOne({})
    .sort({ _id: -1 })
    .lean<Record<string, any>>()
    .exec()
  if (!doc) return NextResponse.json(null)
  const { _id, ...rest } = doc
  return NextResponse.json({ id: String(_id), ...rest })
}
