import { NextResponse } from 'next/server'

import { getPatternSignal } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params
  const data = await getPatternSignal(id)
  return NextResponse.json(data)
}
