import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { alertUpdateSchema, type AlertCreateInput } from '@/lib/validation/schemas'
import { buildAlertSubdoc } from '@/lib/alerts/subdoc'
import type {
  AlertConfig,
  AlertDirection,
  AlertStatus,
  ConditionType,
} from '@/lib/alerts/types'

// A loose view of the embedded alert subdocument for locating + mutating it.
// The runtime objects are real Mongoose subdocuments whose setters track changes
// for save() (except the Mixed `config`, which needs markModified — see below).
export type MutableAlert = {
  _id: unknown
  type?: ConditionType
  targetPrice?: number
  direction?: AlertDirection
  config?: AlertConfig
  status: AlertStatus
  lastTriggeredAt?: Date
  lastTriggeredPrice?: number
  note: string
}

// The minimal contract both owning models satisfy (WatchlistItem, HoldingAlerts):
// find the per-instrument doc by token, expose its `alerts` array + save().
type AlertsDoc = {
  alerts: MutableAlert[]
  markModified: (path: string) => void
  save: () => Promise<unknown>
}
type AlertsModel = {
  findOne: (filter: { instrumentToken: string }) => Promise<AlertsDoc | null>
}

function clearTriggerStamp(alert: MutableAlert): void {
  alert.lastTriggeredAt = undefined
  alert.lastTriggeredPrice = undefined
}

// Shared PUT: either a full condition replace (body carries `type`, or a legacy
// targetPrice+direction that the schema injects type:'price' into) or a
// status/note patch (snooze / disable / re-arm). Re-arming clears the
// last-triggered stamp so the alert can fire again. Used verbatim by both the
// watchlist and holdings [alertId] routes.
export async function handleAlertUpdate(
  model: AlertsModel,
  token: string,
  alertId: string,
  body: unknown,
): Promise<NextResponse> {
  if (!isValidObjectId(alertId)) {
    return NextResponse.json({ error: 'Invalid alert id' }, { status: 400 })
  }

  const parsed = alertUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  await connectDB()
  const doc = await model.findOne({ instrumentToken: token })
  if (!doc) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const alert = doc.alerts.find((a) => String(a._id) === alertId)
  if (!alert) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
  }

  const data = parsed.data
  if ('type' in data) {
    // Full condition replace.
    const sub = buildAlertSubdoc(data as AlertCreateInput)
    alert.type = sub.type
    alert.targetPrice = sub.targetPrice
    if (sub.direction !== undefined) alert.direction = sub.direction
    alert.config = sub.config
    doc.markModified('alerts') // config is Mixed — force persistence
  }
  if (data.note !== undefined) alert.note = data.note
  if (data.status !== undefined) {
    alert.status = data.status
    if (data.status === 'armed') clearTriggerStamp(alert)
  }

  await doc.save()
  return NextResponse.json(alert)
}

// Shared DELETE: splice the addressed alert out of the owning doc.
export async function handleAlertDelete(
  model: AlertsModel,
  token: string,
  alertId: string,
): Promise<NextResponse> {
  if (!isValidObjectId(alertId)) {
    return NextResponse.json({ error: 'Invalid alert id' }, { status: 400 })
  }

  await connectDB()
  const doc = await model.findOne({ instrumentToken: token })
  if (!doc) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const idx = doc.alerts.findIndex((a) => String(a._id) === alertId)
  if (idx === -1) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 })
  }

  ;(doc.alerts as unknown as unknown[]).splice(idx, 1)
  await doc.save()
  return NextResponse.json({ deleted: true })
}
