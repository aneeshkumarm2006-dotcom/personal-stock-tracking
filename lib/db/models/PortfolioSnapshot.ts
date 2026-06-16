import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// One persisted point on the wealth-history chart, keyed uniquely by trading day.
// The whole series is rebuilt and upserted by the daily snapshot job, so each
// run is idempotent and self-healing.
const portfolioSnapshotSchema = new Schema({
  date: { type: Date, required: true, unique: true },
  // Available cash that day: fundsAdded − netInvested (approximate-from-trades).
  cash: { type: Number },
  // Market value of open holdings that day.
  investmentValue: { type: Number },
  // Total invested capital grown at Nifty's return since the first purchase.
  niftyValue: { type: Number },
  // Total invested capital grown at the FD rate since the first purchase.
  fdValue: { type: Number },
})

export type PortfolioSnapshotDoc = InferSchemaType<typeof portfolioSnapshotSchema>

export const PortfolioSnapshot: Model<PortfolioSnapshotDoc> =
  (mongoose.models.PortfolioSnapshot as Model<PortfolioSnapshotDoc>) ||
  mongoose.model<PortfolioSnapshotDoc>('PortfolioSnapshot', portfolioSnapshotSchema)
