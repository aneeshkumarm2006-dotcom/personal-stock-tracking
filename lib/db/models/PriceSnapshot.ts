import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const priceSnapshotSchema = new Schema({
  token: { type: String, required: true, unique: true },
  symbol: { type: String },
  exchange: { type: String },
  ltp: { type: Number },
  open: { type: Number },
  high: { type: Number },
  low: { type: Number },
  close: { type: Number },
  netChange: { type: Number },
  pctChange: { type: Number },
  fetchedAt: { type: Date, required: true, default: Date.now },
})

export type PriceSnapshotDoc = InferSchemaType<typeof priceSnapshotSchema>

export const PriceSnapshot: Model<PriceSnapshotDoc> =
  (mongoose.models.PriceSnapshot as Model<PriceSnapshotDoc>) ||
  mongoose.model<PriceSnapshotDoc>('PriceSnapshot', priceSnapshotSchema)
