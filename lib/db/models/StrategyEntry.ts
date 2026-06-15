import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const strategyEventSchema = new Schema(
  {
    type: { type: String, required: true },
    price: { type: Number, required: true },
    // Shares transacted by this event, when it represents a (partial) exit.
    // Informational events (entry_hit, tp1_hit) leave this undefined.
    quantity: { type: Number },
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
    // First target (TP1). Kept as `targetPrice` for backward compatibility.
    targetPrice: { type: Number, required: true },
    // Optional second target (TP2). When set with quantity >= 2 the entry
    // scales out 50% at TP1 and the remainder at TP2.
    target2: { type: Number },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'quantity must be an integer',
      },
    },
    // Shares already exited (a partial sell at TP1 leaves the rest running).
    soldQuantity: { type: Number, default: 0 },
    // Running high-water mark, set once TP1 is reached. Drives the trailing stop.
    peakPrice: { type: Number },
    direction: { type: String, enum: ['long'], default: 'long' },
    // How a pending entry fills:
    //   - 'limit' (buy the dip): entry sits below price, fills when LTP falls to it.
    //   - 'stop'  (breakout):    entry sits above price, fills when LTP rises to it.
    // Legacy rows default to 'limit', preserving the original fill behaviour.
    triggerType: { type: String, enum: ['limit', 'stop'], default: 'limit' },
    // Live price captured when the entry was created. Used to auto-pick the
    // trigger type and to reject orders that would fill the instant they're made.
    referencePrice: { type: Number },
    status: {
      type: String,
      enum: [
        'pending',
        'active',
        'partial',
        'trailing',
        'tp_hit',
        'sl_hit',
        'trail_hit',
        'closed_manual',
        // Pending entry aged out without ever triggering (see EXPIRY_TRADING_DAYS).
        'expired',
      ],
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
