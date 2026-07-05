import { NextResponse } from 'next/server'

import { listDays } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  const days = await listDays()
  return NextResponse.json(days)
}
