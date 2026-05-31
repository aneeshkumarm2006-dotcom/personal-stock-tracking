import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const chargesSchema = new Schema(
  {
    brokerage: { type: Number, default: 0 },
    stt: { type: Number, default: 0 },
    exchFees: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    stampDuty: { type: Number, default: 0 },
    sebiFees: { type: Number, default: 0 },
  },
  { _id: false },
)

const transactionSchema = new Schema(
  {
    instrumentToken: { type: String, required: true },
    instrumentSymbol: { type: String },
    type: { type: String, enum: ['BUY', 'SELL'], required: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'quantity must be an integer',
      },
    },
    price: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    charges: { type: chargesSchema, default: () => ({}) },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
)

transactionSchema.virtual('totalCharges').get(function (this: {
  charges?: {
    brokerage?: number
    stt?: number
    exchFees?: number
    gst?: number
    stampDuty?: number
    sebiFees?: number
  }
}) {
  const c = this.charges ?? {}
  return (
    (c.brokerage ?? 0) +
    (c.stt ?? 0) +
    (c.exchFees ?? 0) +
    (c.gst ?? 0) +
    (c.stampDuty ?? 0) +
    (c.sebiFees ?? 0)
  )
})

transactionSchema.set('toJSON', { virtuals: true })
transactionSchema.set('toObject', { virtuals: true })

transactionSchema.index({ instrumentToken: 1, date: -1 })

export type TransactionDoc = InferSchemaType<typeof transactionSchema>

export const Transaction: Model<TransactionDoc> =
  (mongoose.models.Transaction as Model<TransactionDoc>) ||
  mongoose.model<TransactionDoc>('Transaction', transactionSchema)
