import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// A free-form note attached to an instrument (not a transaction). One note per
// instrument — the user edits a single block of text on the stock page.
const instrumentNoteSchema = new Schema(
  {
    instrumentToken: { type: String, required: true, unique: true },
    instrumentSymbol: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true },
)

export type InstrumentNoteDoc = InferSchemaType<typeof instrumentNoteSchema>

export const InstrumentNote: Model<InstrumentNoteDoc> =
  (mongoose.models.InstrumentNote as Model<InstrumentNoteDoc>) ||
  mongoose.model<InstrumentNoteDoc>('InstrumentNote', instrumentNoteSchema)
