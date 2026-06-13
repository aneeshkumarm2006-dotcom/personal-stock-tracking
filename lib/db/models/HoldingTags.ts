import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// Tags express the user's *intention* for a position (e.g. "long term",
// "swing", "short term"). They attach to an instrument rather than a single
// transaction, since holdings are aggregated across many transactions.
const holdingTagsSchema = new Schema(
  {
    instrumentToken: { type: String, required: true, unique: true },
    instrumentSymbol: { type: String, default: '' },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
)

export type HoldingTagsDoc = InferSchemaType<typeof holdingTagsSchema>

export const HoldingTags: Model<HoldingTagsDoc> =
  (mongoose.models.HoldingTags as Model<HoldingTagsDoc>) ||
  mongoose.model<HoldingTagsDoc>('HoldingTags', holdingTagsSchema)
