import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { loadPortfolioSummary } from '@/lib/portfolio/summaryResponse'

export const dynamic = 'force-dynamic'

export async function GET() {
  await connectDB()
  const payload = await loadPortfolioSummary()
  return NextResponse.json(payload)
}
