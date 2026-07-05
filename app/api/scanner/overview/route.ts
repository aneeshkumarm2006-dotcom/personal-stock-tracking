import { NextResponse } from 'next/server'

import { getOverview } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await getOverview()
  return NextResponse.json(data)
}
