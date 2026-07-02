import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { HoldingAlerts } from '@/lib/db/models/HoldingAlert'
import {
  alertCreateSchema,
  holdingAlertMetaSchema,
} from '@/lib/validation/schemas'
import { buildAlertSubdoc } from '@/lib/alerts/subdoc'
import type { RawWatchlistAlert } from '@/lib/watchlist/enrich'
import type { WatchlistAlertView } from '@/lib/watchlist/types'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

// Serialize an embedded alert subdoc into the view shape the client renders.
// Identical shape to the watchlist alert view, so the same UI can render it.
// `.lean()` reads don't apply schema defaults, so default `type` to 'price'.
function toView(a: RawWatchlistAlert): WatchlistAlertView {
  return {
    _id: String(a._id),
    type: a.type ?? 'price',
    targetPrice: typeof a.targetPrice === 'number' ? a.targetPrice : null,
    direction: a.direction ?? 'below',
    config: a.config ?? {},
    status: a.status ?? 'armed',
    lastTriggeredAt: a.lastTriggeredAt
      ? new Date(a.lastTriggeredAt).toISOString()
      : null,
    lastTriggeredPrice:
      typeof a.lastTriggeredPrice === 'number' ? a.lastTriggeredPrice : null,
    note: a.note ?? '',
  }
}

// List the alerts for a holding.
export async function GET(_request: Request, { params }: Context) {
  const { token } = await params
  await connectDB()
  const doc = await HoldingAlerts.findOne({ instrumentToken: token }).lean()
  const alerts = ((doc?.alerts ?? []) as unknown as RawWatchlistAlert[]).map(
    toView,
  )
  return NextResponse.json({ instrumentToken: token, alerts })
}

// Add an alert (any condition type) to a holding. Uses the hydrated document so
// Mongoose generates the embedded alert's _id (a raw $push would not), upserting
// the per-instrument doc on the first alert.
export async function POST(request: Request, { params }: Context) {
  const { token } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = alertCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  // symbol/exchange ride the same body but are stripped from the condition; parse
  // them separately so the first POST can seed the per-instrument doc.
  const meta = holdingAlertMetaSchema.safeParse(body)
  const instrumentSymbol = meta.success ? meta.data.instrumentSymbol : undefined
  const exchange = meta.success ? meta.data.exchange : undefined

  await connectDB()
  let doc = await HoldingAlerts.findOne({ instrumentToken: token })
  if (!doc) {
    doc = new HoldingAlerts({
      instrumentToken: token,
      instrumentSymbol: instrumentSymbol ?? '',
      exchange: exchange ?? 'NSE',
    })
  } else {
    // Keep the symbol/exchange fresh so the trigger email stays accurate.
    if (instrumentSymbol) doc.instrumentSymbol = instrumentSymbol
    if (exchange) doc.exchange = exchange
  }

  doc.alerts.push(buildAlertSubdoc(parsed.data))
  await doc.save()

  const created = doc.alerts[doc.alerts.length - 1]
  return NextResponse.json(
    created ? toView(created as unknown as RawWatchlistAlert) : null,
    { status: 201 },
  )
}
