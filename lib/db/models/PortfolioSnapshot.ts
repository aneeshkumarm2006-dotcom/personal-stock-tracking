import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const portfolioSnapshotSchema = new Schema({
  date: { type: Date, required: true, unique: true },
  // Market value of open holdings only.
  totalValue: { type: Number },
  // Cost basis of open holdings.
  totalInvested: { type: Number },
  // Uninvested cash sitting in the trading account (fundsAdded − netInvested).
  availableCash: { type: Number },
  // Total wealth recorded for the day: holdings market value + available cash.
  totalWealth: { type: Number },
  // Total capital deposited into the account — the baseline for total wealth.
  fundsAdded: { type: Number },
  unrealizedPnL: { type: Number },
  realizedPnL: { type: Number },
})

export type PortfolioSnapshotDoc = InferSchemaType<typeof portfolioSnapshotSchema>

export const PortfolioSnapshot: Model<PortfolioSnapshotDoc> =
  (mongoose.models.PortfolioSnapshot as Model<PortfolioSnapshotDoc>) ||
  mongoose.model<PortfolioSnapshotDoc>('PortfolioSnapshot', portfolioSnapshotSchema)
