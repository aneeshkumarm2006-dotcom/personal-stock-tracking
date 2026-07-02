import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// Daily-cadence indicator values for one instrument, computed from ~2y of daily
// candles once per session and compared against the live quote each minute (see
// lib/indicators/refresh.ts). One upserted doc per token, like PriceSnapshot —
// a latest-value cache, not a time series. `sma`/`ema`/`rating` are Mixed maps
// (keyed by period / timeframe).
const indicatorSnapshotSchema = new Schema({
  token: { type: String, required: true, unique: true },
  exchange: { type: String },
  computedAt: { type: Date, required: true, default: Date.now },
  // Date of the last daily candle used — the staleness key (recompute once a new
  // session has closed).
  asOfCandle: { type: Date },
  sma: { type: Schema.Types.Mixed, default: {} },
  ema: { type: Schema.Types.Mixed, default: {} },
  rsi14: { type: Number },
  macd: { type: Number },
  macdSignal: { type: Number },
  prevMacd: { type: Number },
  prevSignal: { type: Number },
  rating: { type: Schema.Types.Mixed, default: {} },
  prevRating: { type: Schema.Types.Mixed, default: {} },
  high52w: { type: Number },
  low52w: { type: Number },
  avgVolume20d: { type: Number },
})

export type IndicatorSnapshotDoc = InferSchemaType<typeof indicatorSnapshotSchema>

export const IndicatorSnapshot: Model<IndicatorSnapshotDoc> =
  (mongoose.models.IndicatorSnapshot as Model<IndicatorSnapshotDoc>) ||
  mongoose.model<IndicatorSnapshotDoc>(
    'IndicatorSnapshot',
    indicatorSnapshotSchema,
  )
