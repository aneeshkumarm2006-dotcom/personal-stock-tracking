import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// A Web Push subscription for one of the owner's devices/browsers. Single-user
// app, so there's no user ref — every stored subscription belongs to the owner
// and all are pushed to. Keyed by `endpoint` (unique) so re-subscribing the same
// browser upserts rather than duplicates. Dead endpoints (404/410 from the push
// service) are pruned by the sender.
const pushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
    lastSeenAt: { type: Date },
  },
  { timestamps: true },
)

export type PushSubscriptionDoc = InferSchemaType<typeof pushSubscriptionSchema>

export const PushSubscription: Model<PushSubscriptionDoc> =
  (mongoose.models.PushSubscription as Model<PushSubscriptionDoc>) ||
  mongoose.model<PushSubscriptionDoc>('PushSubscription', pushSubscriptionSchema)
