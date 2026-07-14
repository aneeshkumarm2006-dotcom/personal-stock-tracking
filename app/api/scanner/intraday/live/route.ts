import { NextResponse } from 'next/server'

import { getIntradayLive } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

// Latest live-session doc (the Python live runner upserts _id = session date).
// The client "Right now" panel polls this while the market is open.
export async function GET() {
  const doc = await getIntradayLive()
  return NextResponse.json(doc)
}
