import { NextResponse } from 'next/server'

import { getPatternsOverview } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await getPatternsOverview()
  return NextResponse.json(data)
}
