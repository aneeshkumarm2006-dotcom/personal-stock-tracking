import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { manualCloseSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const CLOSEABLE_STATUSES = new Set(['pending', 'active', 'partial', 'trailing'])

export async function POST(request: Request, { params }: RouteContext) {
  await connectDB()
  const { id } = await params

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = manualCloseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const entry = await StrategyEntry.findById(id)
  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  if (!CLOSEABLE_STATUSES.has(entry.status ?? '')) {
    return NextResponse.json(
      { error: 'Only open entries can be manually closed' },
      { status: 409 },
    )
  }

  // A manual close books whatever shares are still running. For a pending entry
  // (never filled) that is the full lot but no actual position existed; the
  // closePrice still records the operator's intent.
  const wasPending = entry.status === 'pending'
  const remaining = Math.max(0, entry.quantity - (entry.soldQuantity ?? 0))
  entry.soldQuantity = entry.quantity
  entry.status = 'closed_manual'
  entry.events.push({
    type: 'closed_manual',
    price: parsed.data.closePrice,
    quantity: wasPending ? undefined : remaining,
    timestamp: parsed.data.closeDate,
  })

  await entry.save()
  return NextResponse.json(entry.toJSON())
}
