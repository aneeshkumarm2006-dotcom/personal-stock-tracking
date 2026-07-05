import { NextResponse } from 'next/server'

import { getHealth } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  const health = await getHealth()
  return NextResponse.json(health)
}
