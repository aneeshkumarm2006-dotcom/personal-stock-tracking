import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// A single price-cross alert, embedded on a watchlist item. Unlike
// `strategyEntry.events` (append-only, `_id: false`), alerts are individually
// editable/deletable, so they keep their own `_id` for addressing via the API
// (`/api/watchlist/[token]/alerts/[alertId]`). Lifecycle mirrors the strategy
// status machine: fires once on `armed -> triggered`, then disarms until
// manually re-armed.
const alertSchema = new Schema(
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

// One document per watched instrument. A pre-portfolio staging area: tags,
// notes, a target buy price, and embedded alerts. Zero positions, zero P&L.
const watchlistItemSchema = new Schema(
  {
    instrumentToken: { type: String, required: true, unique: true },
    instrumentSymbol: { type: String, default: '' },
    exchange: { type: String, enum: ['NSE', 'BSE'], default: 'NSE' },
    name: { type: String, default: '' },
    tags: { type: [String], default: [] }, // SAME shape as HoldingTags.tags
    notes: { type: String, default: '' }, // "why I'm watching"
    targetBuyPrice: { type: Number }, // optional; powers distance-to-target
    priceWhenAdded: { type: Number }, // snapshot of LTP at add time
    conviction: {
      type: String,
      enum: ['watching', 'interested', 'high'],
      default: 'watching',
    },
    alerts: { type: [alertSchema], default: [] },
  },
  { timestamps: true },
)

export type WatchlistAlertDoc = InferSchemaType<typeof alertSchema>
export type WatchlistItemDoc = InferSchemaType<typeof watchlistItemSchema>

export const WatchlistItem: Model<WatchlistItemDoc> =
  (mongoose.models.WatchlistItem as Model<WatchlistItemDoc>) ||
  mongoose.model<WatchlistItemDoc>('WatchlistItem', watchlistItemSchema)
