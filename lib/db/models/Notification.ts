import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// A durable, in-app notification the banner reads. Two families share this doc:
//   • strategy SL/TP exits on entered-into-portfolio positions (source
//     'strategy') — something the user must go execute; and
//   • user-armed price-cross alerts on watchlist items (source 'watchlist') or
//     portfolio holdings (source 'portfolio').
// It is the source of truth the banner reads; email and web-push are best-effort
// side effects layered on top, so an alert still surfaces (when the site is
// opened) even if those fail.
const notificationSchema = new Schema(
  {
    // Which feature raised it. Defaults to 'strategy' so notifications written
    // before this field existed keep classifying correctly.
    source: {
      type: String,
      enum: ['strategy', 'watchlist', 'portfolio'],
      default: 'strategy',
    },
    // Strategy exits use StrategyExitKind; legacy price alerts use
    // price_below/above; every other (Advanced) alert condition uses the generic
    // 'alert' kind and carries its specifics in `conditionType` + the body text.
    kind: {
      type: String,
      enum: [
        'sl_hit',
        'tp_hit',
        'trail_hit',
        'tp1_partial',
        'price_below',
        'price_above',
        'alert',
      ],
      required: true,
    },
    // The Advanced condition type ('volume','sma_cross','rsi',…) for kind 'alert'.
    // Unset for strategy exits and legacy price alerts.
    conditionType: { type: String },
    // Drives the banner colour: danger (SL) / success (TP/trail) / warning
    // (partial) / info (price-cross alerts).
    severity: {
      type: String,
      enum: ['danger', 'success', 'warning', 'info'],
      required: true,
    },
    // Set only for strategy exits (the position that fired it).
    strategyEntryId: {
      type: Schema.Types.ObjectId,
      ref: 'StrategyEntry',
    },
    // Set only for price alerts: the embedded alert's _id (on WatchlistItem /
    // HoldingAlerts). Lets the UI/link resolve back to the specific alert.
    alertId: { type: String },
    groupId: { type: Schema.Types.ObjectId, ref: 'StrategyGroup' },
    instrumentToken: { type: String, required: true },
    instrumentSymbol: { type: String, default: '' },
    title: { type: String, required: true },
    body: { type: String, required: true },
    // Trigger price and (strategy only) the number of shares to act on now.
    price: { type: Number, required: true },
    quantity: { type: Number },
    // Fire-once key, unique across all sources (see index below).
    dedupeKey: { type: String },
    status: {
      type: String,
      enum: ['unread', 'acknowledged'],
      default: 'unread',
    },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true },
)

// Fire-once guard for every source. The caller builds a stable dedupeKey
// (strategy:<entry>:<kind> for exits, <source>:<alertId>:<triggeredAt> for price
// alerts) and a duplicate insert — from a race between two refresh cycles or a
// failed-save retry — is rejected with E11000. Partial so the pre-existing rows
// that predate this field (no dedupeKey) are simply excluded rather than all
// colliding on a single null key.
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $exists: true } } },
)
// Banner query: newest unread first.
notificationSchema.index({ status: 1, createdAt: -1 })

export type NotificationDoc = InferSchemaType<typeof notificationSchema>

export const Notification: Model<NotificationDoc> =
  (mongoose.models.Notification as Model<NotificationDoc>) ||
  mongoose.model<NotificationDoc>('Notification', notificationSchema)

// Reconcile indexes with the schema once per process. This drops the legacy
// strategy-only unique index ({strategyEntryId, kind}) that would otherwise
// reject a second null-strategyEntryId price-alert doc, and builds the new
// dedupeKey index. Memoised (and self-healing on failure) so it costs one
// syncIndexes call per process, kicked off from the refresh cycle.
let indexSync: Promise<void> | null = null
export function ensureNotificationIndexes(): Promise<void> {
  if (!indexSync) {
    indexSync = Notification.syncIndexes()
      .then(() => undefined)
      .catch((err) => {
        indexSync = null // allow a retry on the next cycle
        console.log(
          JSON.stringify({
            event: 'notification.syncIndexes',
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          }),
        )
      })
  }
  return indexSync
}
