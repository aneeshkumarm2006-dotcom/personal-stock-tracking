import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

// A persistent symbol -> sector cache for the long tail of stocks not covered
// by the offline maps in lib/portfolio/sectors.ts. Populated best-effort from
// the indianapi.in fundamentals `industry` field so a resolved sector survives
// restarts and is only ever fetched once per symbol. Keyed by the SAME
// normalized symbol that sectorForSymbol() uses.
const sectorCacheSchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true },
    sector: { type: String, required: true },
    // Where the value came from — always 'indianapi' today, kept for future
    // provenance/backfill decisions.
    source: { type: String, default: 'indianapi' },
  },
  { timestamps: true },
)

export type SectorCacheDoc = InferSchemaType<typeof sectorCacheSchema>

export const SectorCache: Model<SectorCacheDoc> =
  (mongoose.models.SectorCache as Model<SectorCacheDoc>) ||
  mongoose.model<SectorCacheDoc>('SectorCache', sectorCacheSchema)
