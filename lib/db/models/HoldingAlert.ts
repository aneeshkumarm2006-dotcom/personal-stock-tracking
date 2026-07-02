import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

import { alertSchema } from '@/lib/db/schemas/alertSchema'

// Alerts attached to a portfolio holding. Mirrors the embedded alert on
// WatchlistItem (same shared alertSchema, same fire-once status machine, same
// individually addressable `_id`), but lives on its own per-instrument document
// so portfolio and watchlist stay separate stores. One doc per instrument token,
// exactly like HoldingTags / InstrumentNote.
const holdingAlertsSchema = new Schema(
  {
    instrumentToken: { type: String, required: true, unique: true },
    instrumentSymbol: { type: String, default: '' },
    exchange: { type: String, enum: ['NSE', 'BSE'], default: 'NSE' },
    alerts: { type: [alertSchema], default: [] },
  },
  { timestamps: true },
)

export type HoldingAlertDoc = InferSchemaType<typeof alertSchema>
export type HoldingAlertsDoc = InferSchemaType<typeof holdingAlertsSchema>

export const HoldingAlerts: Model<HoldingAlertsDoc> =
  (mongoose.models.HoldingAlerts as Model<HoldingAlertsDoc>) ||
  mongoose.model<HoldingAlertsDoc>('HoldingAlerts', holdingAlertsSchema)
