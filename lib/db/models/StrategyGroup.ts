import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const strategyGroupSchema = new Schema({
  name: { type: String, required: true },
  allocatedCapital: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
})

export type StrategyGroupDoc = InferSchemaType<typeof strategyGroupSchema>

export const StrategyGroup: Model<StrategyGroupDoc> =
  (mongoose.models.StrategyGroup as Model<StrategyGroupDoc>) ||
  mongoose.model<StrategyGroupDoc>('StrategyGroup', strategyGroupSchema)
