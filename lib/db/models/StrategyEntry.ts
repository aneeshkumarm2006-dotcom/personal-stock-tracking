import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const strategyEventSchema = new Schema(
  {
    type: { type: String, required: true },
    price: { type: Number, required: true },
    timestamp: { type: Date, required: true },
  },
  { _id: false },
)

const strategyEntrySchema = new Schema(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'StrategyGroup',
      required: true,
    },
    instrumentToken: { type: String, required: true },
    instrumentSymbol: { type: String },
    entryPrice: { type: Number, required: true },
    stopLoss: { type: Number, required: true },
    targetPrice: { type: Number, required: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'quantity must be an integer',
      },
    },
    direction: { type: String, enum: ['long'], default: 'long' },
    status: {
      type: String,
      enum: ['pending', 'active', 'tp_hit', 'sl_hit', 'closed_manual'],
      default: 'pending',
    },
    events: { type: [strategyEventSchema], default: [] },
  },
  { timestamps: true },
)

strategyEntrySchema.index({ groupId: 1, status: 1 })

export type StrategyEntryDoc = InferSchemaType<typeof strategyEntrySchema>

export const StrategyEntry: Model<StrategyEntryDoc> =
  (mongoose.models.StrategyEntry as Model<StrategyEntryDoc>) ||
  mongoose.model<StrategyEntryDoc>('StrategyEntry', strategyEntrySchema)
