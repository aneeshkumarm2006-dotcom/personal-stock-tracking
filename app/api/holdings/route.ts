import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { loadHoldingsResponse } from '@/lib/portfolio/holdingsResponse'

export const dynamic = 'force-dynamic'

export async function GET() {
  await connectDB()
  const payload = await loadHoldingsResponse()
  return NextResponse.json(payload)
}
