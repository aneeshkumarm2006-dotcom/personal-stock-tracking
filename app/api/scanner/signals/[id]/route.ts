import { NextResponse } from 'next/server'

import { getSignal } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Thin wrapper over getSignal (which connects + serializes). `id` arrives already
// URL-decoded by Next, so the colon-bearing _id ("2026-07-03:RELIANCE") is intact.
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params
  const view = await getSignal(id)
  if (!view.signal && !view.position) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
  }
  return NextResponse.json(view)
}
