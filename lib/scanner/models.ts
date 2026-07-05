import mongoose, { Schema, type Model } from 'mongoose'

// Read-wrapper models over the Python-written `scanner*` collections. Python
// writes camelCase field + collection names with NO Mongoose involvement, so:
//  - collection names are set EXPLICITLY (3rd arg) — the default pluralizer would
//    guess wrong (e.g. `scannerruns`, `scannerstats`).
//  - `strict: false` so `.lean()` returns every stored field, including free-form
//    nested dicts (scoreBreakdown, snapshot, extras, gateFunnel, configSnapshot).
//  - only the fields we filter/sort on are declared for typing; everything else
//    flows through untyped.
//  - signals/positions/settings/stats key on a STRING `_id` (runs/dailyStats use an
//    auto ObjectId `_id` and key on a plain `date` field).
// The serializers in serialize.ts turn these permissive lean docs into the typed
// shapes from types.ts, so the doc type here is intentionally loose (`any`).

type ScannerDoc = Record<string, any>

const runSchema = new Schema<ScannerDoc>(
  {
    date: { type: String },
    status: { type: String },
    finishedAt: { type: Date },
  },
  { strict: false, collection: 'scannerRuns' },
)

const signalSchema = new Schema<ScannerDoc>(
  {
    _id: { type: String },
    date: { type: String },
    symbol: { type: String },
    strategy: { type: String },
    rank: { type: Number },
    positionId: { type: String },
  },
  { strict: false, collection: 'scannerSignals' },
)

const positionSchema = new Schema<ScannerDoc>(
  {
    _id: { type: String },
    signalId: { type: String },
    signalDate: { type: String },
    symbol: { type: String },
    strategy: { type: String },
    status: { type: String },
    entryDate: { type: String },
  },
  { strict: false, collection: 'scannerPositions' },
)

const dailyStatSchema = new Schema<ScannerDoc>(
  {
    date: { type: String },
  },
  { strict: false, collection: 'scannerDailyStats' },
)

const settingsSchema = new Schema<ScannerDoc>(
  {
    _id: { type: String },
  },
  { strict: false, collection: 'scannerSettings' },
)

const statsSchema = new Schema<ScannerDoc>(
  {
    _id: { type: String },
  },
  { strict: false, collection: 'scannerStats' },
)

export const ScannerRunModel: Model<ScannerDoc> =
  (mongoose.models.ScannerRun as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>('ScannerRun', runSchema, 'scannerRuns')

export const ScannerSignalModel: Model<ScannerDoc> =
  (mongoose.models.ScannerSignal as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>('ScannerSignal', signalSchema, 'scannerSignals')

export const ScannerPositionModel: Model<ScannerDoc> =
  (mongoose.models.ScannerPosition as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>(
    'ScannerPosition',
    positionSchema,
    'scannerPositions',
  )

export const ScannerDailyStatModel: Model<ScannerDoc> =
  (mongoose.models.ScannerDailyStat as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>(
    'ScannerDailyStat',
    dailyStatSchema,
    'scannerDailyStats',
  )

export const ScannerSettingsModel: Model<ScannerDoc> =
  (mongoose.models.ScannerSettings as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>('ScannerSettings', settingsSchema, 'scannerSettings')

export const ScannerStatsModel: Model<ScannerDoc> =
  (mongoose.models.ScannerStats as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>('ScannerStats', statsSchema, 'scannerStats')
