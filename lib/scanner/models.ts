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

// Intraday replay collections (Python: scanner/intraday/publishing.py). Runs key on a
// plain `date`; trades key on a STRING `_id` "{date}_{symbol}_{arm}"; stats is the
// `_id: "summary"` singleton.
const intradayRunSchema = new Schema<ScannerDoc>(
  {
    date: { type: String },
    status: { type: String },
  },
  { strict: false, collection: 'scannerIntradayRuns' },
)

const intradayTradeSchema = new Schema<ScannerDoc>(
  {
    _id: { type: String },
    date: { type: String },
    symbol: { type: String },
    arm: { type: String },
    status: { type: String },
  },
  { strict: false, collection: 'scannerIntradayTrades' },
)

const intradayStatsSchema = new Schema<ScannerDoc>(
  {
    _id: { type: String },
  },
  { strict: false, collection: 'scannerIntradayStats' },
)

export const ScannerIntradayRunModel: Model<ScannerDoc> =
  (mongoose.models.ScannerIntradayRun as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>(
    'ScannerIntradayRun',
    intradayRunSchema,
    'scannerIntradayRuns',
  )

export const ScannerIntradayTradeModel: Model<ScannerDoc> =
  (mongoose.models.ScannerIntradayTrade as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>(
    'ScannerIntradayTrade',
    intradayTradeSchema,
    'scannerIntradayTrades',
  )

const intradayLiveSchema = new Schema<ScannerDoc>(
  {
    _id: { type: String }, // the session date YYYY-MM-DD
    phase: { type: String },
  },
  { strict: false, collection: 'scannerIntradayLive' },
)

export const ScannerIntradayLiveModel: Model<ScannerDoc> =
  (mongoose.models.ScannerIntradayLive as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>(
    'ScannerIntradayLive',
    intradayLiveSchema,
    'scannerIntradayLive',
  )

export const ScannerIntradayStatsModel: Model<ScannerDoc> =
  (mongoose.models.ScannerIntradayStats as Model<ScannerDoc>) ||
  mongoose.model<ScannerDoc>(
    'ScannerIntradayStats',
    intradayStatsSchema,
    'scannerIntradayStats',
  )
