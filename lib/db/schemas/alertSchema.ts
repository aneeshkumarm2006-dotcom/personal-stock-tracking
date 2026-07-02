import { Schema } from 'mongoose'

import { CONDITION_TYPES } from '@/lib/alerts/types'

// A single alert, embedded on a watchlist item (WatchlistItem) or a portfolio
// holding-alerts doc (HoldingAlerts). One shared schema so the two never drift.
//
// Lifecycle mirrors the strategy status machine: fires once on `armed ->
// triggered`, then disarms until manually re-armed. Alerts keep their own `_id`
// so they're individually addressable via
// /api/{watchlist|holdings}/[token]/alerts/[alertId].
//
// Backward compatibility: alerts created before the condition types existed have
// no `type` and a bare `targetPrice`/`direction`. `type` defaults to 'price' so
// hydrated reads classify them correctly; `targetPrice` is no longer required
// because non-price conditions don't have one (the Zod discriminated union at the
// API edge enforces per-type requirements). `config` holds the parameters for
// every non-price condition.
export const alertSchema = new Schema(
  {
    type: {
      type: String,
      enum: [...CONDITION_TYPES],
      default: 'price',
    },
    targetPrice: { type: Number }, // required only for `price` (validated in Zod)
    direction: { type: String, enum: ['below', 'above'], default: 'below' },
    // Per-type parameter bag (period, thresholdPct, band, …). Mixed because the
    // shape depends on `type`; the Zod union is the real validator.
    config: { type: Schema.Types.Mixed, default: {} },
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
