import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

export const ANGEL_SESSION_SINGLETON_ID = 'singleton'

const angelSessionSchema = new Schema({
  _id: { type: String, default: ANGEL_SESSION_SINGLETON_ID },
  jwtToken: { type: String },
  refreshToken: { type: String },
  feedToken: { type: String },
  issuedAt: { type: Date },
})

export type AngelSessionDoc = InferSchemaType<typeof angelSessionSchema>

export const AngelSession: Model<AngelSessionDoc> =
  (mongoose.models.AngelSession as Model<AngelSessionDoc>) ||
  mongoose.model<AngelSessionDoc>('AngelSession', angelSessionSchema)
