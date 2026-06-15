import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { HoldingAlerts } from '@/lib/db/models/HoldingAlert'
import { holdingAlertCreateSchema } from '@/lib/validation/schemas'
import type { RawWatchlistAlert } from '@/lib/watchlist/enrich'
import type { WatchlistAlertView } from '@/lib/watchlist/types'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

// Serialize an embedded alert subdoc into the view shape the client renders.
// Identical shape to the watchlist alert view, so the same UI can render it.
function toView(a: RawWatchlistAlert): WatchlistAlertView {
  return {
    _id: String(a._id),
    targetPrice: a.targetPrice,
    direction: a.direction ?? 'below',
    status: a.status ?? 'armed',
    lastTriggeredAt: a.lastTriggeredAt
      ? new Date(a.lastTriggeredAt).toISOString()
      : null,
    lastTriggeredPrice:
      typeof a.lastTriggeredPrice === 'number' ? a.lastTriggeredPrice : null,
    note: a.note ?? '',
  }
}

// List the price-cross alerts for a holding.
export async function GET(_request: Request, { params }: Context) {
  const { token } = await params
  await connectDB()
  const doc = await HoldingAlerts.findOne({ instrumentToken: token }).lean()
  const alerts = ((doc?.alerts ?? []) as unknown as RawWatchlistAlert[]).map(
    toView,
  )
  return NextResponse.json({ instrumentToken: token, alerts })
}

// Add a price-cross alert to a holding. Uses the hydrated document so Mongoose
// generates the embedded alert's _id (a raw $push would not), upserting the
// per-instrument doc on the first alert.
export async function POST(request: Request, { params }: Context) {
  const { token } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = holdingAlertCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  await connectDB()
  let doc = await HoldingAlerts.findOne({ instrumentToken: token })
  if (!doc) {
    doc = new HoldingAlerts({
      instrumentToken: token,
      instrumentSymbol: parsed.data.instrumentSymbol ?? '',
      exchange: parsed.data.exchange ?? 'NSE',
    })
  } else {
    // Keep the symbol/exchange fresh so the trigger email stays accurate.
    if (parsed.data.instrumentSymbol) {
      doc.instrumentSymbol = parsed.data.instrumentSymbol
    }
    if (parsed.data.exchange) doc.exchange = parsed.data.exchange
  }

  doc.alerts.push({
    targetPrice: parsed.data.targetPrice,
    direction: parsed.data.direction,
    note: parsed.data.note ?? '',
    status: parsed.data.status ?? 'armed',
  })
  await doc.save()

  const created = doc.alerts[doc.alerts.length - 1]
  return NextResponse.json(
    created ? toView(created as unknown as RawWatchlistAlert) : null,
    { status: 201 },
  )
}
