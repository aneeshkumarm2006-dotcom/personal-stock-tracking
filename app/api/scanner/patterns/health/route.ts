import { NextResponse } from 'next/server'

import { getPatternsHealth } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await getPatternsHealth()
  return NextResponse.json(data)
}
