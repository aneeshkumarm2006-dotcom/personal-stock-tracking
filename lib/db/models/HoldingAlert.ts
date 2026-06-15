import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// Price-cross alerts attached to a portfolio holding. Mirrors the embedded
// alert on WatchlistItem (same fire-once status machine, same individually
// addressable `_id`), but lives on its own per-instrument document so portfolio
// and watchlist stay separate stores. One doc per instrument token, exactly
// like HoldingTags / InstrumentNote.
const holdingAlertSchema = new Schema(
  {
    targetPrice: { type: Number, required: true },
    direction: { type: String, enum: ['below', 'above'], default: 'below' },
    status: {
      type: String,
      enum: ['armed', 'triggered', 'snoozed', 'disabled'],
      default: 'armed',
    },
    lastTriggeredAt: { type: Date },
    lastTriggeredPrice: { type: Number },
    note: { type: String, default: '' },
  },
  { _id: true, timestamps: true },
)

const holdingAlertsSchema = new Schema(
  {
    instrumentToken: { type: String, required: true, unique: true },
    instrumentSymbol: { type: String, default: '' },
    exchange: { type: String, enum: ['NSE', 'BSE'], default: 'NSE' },
    alerts: { type: [holdingAlertSchema], default: [] },
  },
  { timestamps: true },
)

export type HoldingAlertDoc = InferSchemaType<typeof holdingAlertSchema>
export type HoldingAlertsDoc = InferSchemaType<typeof holdingAlertsSchema>

export const HoldingAlerts: Model<HoldingAlertsDoc> =
  (mongoose.models.HoldingAlerts as Model<HoldingAlertsDoc>) ||
  mongoose.model<HoldingAlertsDoc>('HoldingAlerts', holdingAlertsSchema)
