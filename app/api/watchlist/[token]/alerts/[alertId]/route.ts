import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { WatchlistItem } from '@/lib/db/models/WatchlistItem'
import { priceAlertUpdateSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string; alertId: string }> }

// A loose view of the embedded alert subdocument for locating + mutating it.
// (InferSchemaType doesn't surface `_id`/subdoc methods; the runtime objects
// are real Mongoose subdocuments whose setters track changes for save().)
type MutableAlert = {
  _id: unknown
  targetPrice: number
  direction: 'below' | 'above'
  status: 'armed' | 'triggered' | 'snoozed' | 'disabled'
  lastTriggeredAt?: Date
  lastTriggeredPrice?: number
  note: string
}

// Edit an alert, or snooze / disable / re-arm it. Re-arming clears the
// last-triggered stamp so it can fire again.
export async function PUT(request: Request, { params }: Context) {
  const { token, alertId } = await params

  if (!isValidObjectId(alertId)) {
    return NextResponse.json({ error: 'Invalid alert id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = priceAlertUpdateSchema.safeParse(body)
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

  const alerts = doc.alerts as unknown as MutableAlert[]
  const alert = alerts.find((a) => String(a._id) === alertId)
  if (!alert) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
  }

  const data = parsed.data
  if (data.targetPrice !== undefined) alert.targetPrice = data.targetPrice
  if (data.direction !== undefined) alert.direction = data.direction
  if (data.note !== undefined) alert.note = data.note
  if (data.status !== undefined) {
    alert.status = data.status
    if (data.status === 'armed') {
      alert.lastTriggeredAt = undefined
      alert.lastTriggeredPrice = undefined
    }
  }

  await doc.save()
  return NextResponse.json(alert)
}

export async function DELETE(_request: Request, { params }: Context) {
  const { token, alertId } = await params

  if (!isValidObjectId(alertId)) {
    return NextResponse.json({ error: 'Invalid alert id' }, { status: 400 })
  }

  await connectDB()
  const doc = await WatchlistItem.findOne({ instrumentToken: token })
  if (!doc) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const alerts = doc.alerts as unknown as MutableAlert[]
  const idx = alerts.findIndex((a) => String(a._id) === alertId)
  if (idx === -1) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
  }

  ;(doc.alerts as unknown as unknown[]).splice(idx, 1)
  await doc.save()
  return NextResponse.json({ deleted: true })
}
