import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// Singleton document holding the user's trading-account cash. Only the total
// funds deposited into the account are stored; available cash is *derived* as
// fundsAdded minus net invested from the transaction ledger, so it stays
// correct across transaction edits and deletes (matching how the rest of the
// app derives holdings and P&L from transactions).
//
// `key` is fixed to 'default' and unique so there can only ever be one row;
// reads and writes target it via upsert.
const cashAccountSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true, immutable: true },
    fundsAdded: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
)

export type CashAccountDoc = InferSchemaType<typeof cashAccountSchema>

export const CashAccount: Model<CashAccountDoc> =
  (mongoose.models.CashAccount as Model<CashAccountDoc>) ||
  mongoose.model<CashAccountDoc>('CashAccount', cashAccountSchema)
