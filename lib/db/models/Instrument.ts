import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const instrumentSchema = new Schema(
  {
    symbol: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    name: { type: String },
    exchange: { type: String, enum: ['NSE', 'BSE'], required: true },
  },
  { timestamps: true },
)

instrumentSchema.index({ symbol: 1 })

export type InstrumentDoc = InferSchemaType<typeof instrumentSchema>

export const Instrument: Model<InstrumentDoc> =
  (mongoose.models.Instrument as Model<InstrumentDoc>) ||
  mongoose.model<InstrumentDoc>('Instrument', instrumentSchema)
