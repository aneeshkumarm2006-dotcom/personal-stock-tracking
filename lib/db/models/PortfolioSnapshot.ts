import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const portfolioSnapshotSchema = new Schema({
  date: { type: Date, required: true, unique: true },
  totalValue: { type: Number },
  totalInvested: { type: Number },
  unrealizedPnL: { type: Number },
  realizedPnL: { type: Number },
})

export type PortfolioSnapshotDoc = InferSchemaType<typeof portfolioSnapshotSchema>

export const PortfolioSnapshot: Model<PortfolioSnapshotDoc> =
  (mongoose.models.PortfolioSnapshot as Model<PortfolioSnapshotDoc>) ||
  mongoose.model<PortfolioSnapshotDoc>('PortfolioSnapshot', portfolioSnapshotSchema)
