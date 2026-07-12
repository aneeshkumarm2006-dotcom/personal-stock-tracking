import { NextResponse } from 'next/server'

import { getPatternDay } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ date: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const { date } = await params
  const day = await getPatternDay(date)
  return NextResponse.json(day)
}
