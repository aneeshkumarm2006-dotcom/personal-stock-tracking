import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { WatchlistItem } from '@/lib/db/models/WatchlistItem'
import { priceAlertSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

// Add a price-cross alert to a watchlist item. Uses the hydrated document so
// Mongoose generates the embedded alert's _id (a raw $push would not).
export async function POST(request: Request, { params }: Context) {
  const { token } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = priceAlertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  await connectDB()
  const doc = await WatchlistItem.findOne({ instrumentToken: token })
  if (!doc) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  doc.alerts.push({
    targetPrice: parsed.data.targetPrice,
    direction: parsed.data.direction,
    note: parsed.data.note ?? '',
    status: parsed.data.status ?? 'armed',
  })
  await doc.save()

  const created = doc.alerts[doc.alerts.length - 1]
  return NextResponse.json(created ?? null, { status: 201 })
}
