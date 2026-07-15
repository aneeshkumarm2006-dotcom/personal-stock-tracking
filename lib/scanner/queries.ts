// SERVER-ONLY. Imports the Mongoose read-models + connectDB, so this must never be
// pulled into a 'use client' bundle. Every function connects first, reads with
// .lean(), and returns already-serialized (client-safe) shapes from types.ts.

import { unstable_cache } from 'next/cache'

import { connectDB } from '@/lib/db/connect'
import {
  ScannerRunModel,
  ScannerSignalModel,
  ScannerPositionModel,
  ScannerDailyStatModel,
  ScannerSettingsModel,
  ScannerStatsModel,
} from './models'
import {
  serializeRun,
  serializeSignal,
  serializePosition,
  serializeDailyStat,
  serializeSummary,
  serializeSettings,
} from './serialize'
import type {
  OverviewData,
  DayListItem,
  DayView,
  DaySignal,
  ScannerPosition,
  StockBlock,
  SignalView,
  ScannerSettings,
  HealthData,
  PositionsFilter,
} from './types'
import type { ScannerSettingsUpdate } from './schemas'

type Raw = Record<string, any>

// Read-side firewall (Inv 4): the swing tab must never read a family='pattern'
// doc. Python already scopes the pattern paper/publish/prune to their own family;
// the Phase-6 swing read-layer predates patterns, so the swing signal/position
// reads are scoped here. `$ne: 'pattern'` keeps legacy docs (no `family` field)
// and explicit `swing` in the swing view. (scannerStats/scannerDailyStats/
// scannerRuns are swing-only collections — patterns write scannerPatternStats and
// no run/daily docs — so they need no filter.)
const NOT_PATTERN = { family: { $ne: 'pattern' } }

// Full-collection read + in-JS rollup. The scanner data is written out-of-band
// by the Python pipeline, so Next can't be told to revalidate on write — cache
// the result for a short window instead (getOverview below). A revisit within
// the window skips the Mongo read and the aggregation entirely.
async function computeOverview(): Promise<OverviewData> {
  await connectDB()
  const [summaryDoc, dailyDocs, runDocs, openPositionsCount, positionDocs] =
    await Promise.all([
      ScannerStatsModel.findById('summary').lean<Raw>().exec(),
      ScannerDailyStatModel.find({}).sort({ date: 1 }).lean<Raw[]>().exec(),
      ScannerRunModel.find({}).sort({ date: -1 }).limit(10).lean<Raw[]>().exec(),
      ScannerPositionModel.countDocuments({
        status: 'OPEN',
        ...NOT_PATTERN,
      }).exec(),
      ScannerPositionModel.find({ ...NOT_PATTERN }).lean<Raw[]>().exec(),
    ])

  const positions = (positionDocs ?? []).map(serializePosition)

  return {
    summary: summaryDoc ? serializeSummary(summaryDoc) : null,
    daily: (dailyDocs ?? []).map(serializeDailyStat),
    recentRuns: (runDocs ?? []).map(serializeRun),
    openPositionsCount: openPositionsCount ?? 0,
    byStock: aggregateByStock(positions),
    positions: sortPositionsForDisplay(positions),
  }
}

// 60s keeps intraday position marks reasonably live while collapsing repeat
// visits (and the parallel /api/scanner/overview poll-free fetch) onto one
// computation.
export const getOverview = unstable_cache(computeOverview, ['scanner-overview'], {
  revalidate: 60,
})

// OPEN/PENDING first (most recent entry/signal first), then closed/skipped by
// most recent signal date — mirrors the listPositions ordering.
function sortPositionsForDisplay(positions: ScannerPosition[]): ScannerPosition[] {
  const isOpen = (p: ScannerPosition) =>
    p.status === 'OPEN' || p.status === 'PENDING_ENTRY'
  const desc = (a: string | null | undefined, b: string | null | undefined) => {
    const av = a ?? ''
    const bv = b ?? ''
    return av < bv ? 1 : av > bv ? -1 : 0
  }
  return [...positions].sort((a, b) => {
    const ao = isOpen(a)
    const bo = isOpen(b)
    if (ao !== bo) return ao ? -1 : 1
    if (ao) return desc(a.entryDate ?? a.signalDate, b.entryDate ?? b.signalDate)
    return desc(a.exitDate ?? a.signalDate, b.exitDate ?? b.signalDate)
  })
}

// Roll positions up per symbol into the same TradeBlock shape the Python publisher
// emits per strategy, plus an `active` flag (currently holds an OPEN/PENDING
// position) and the strategies that have traded the symbol. winRate is a fraction
// (0..1); avgR / profitFactor are null when there are no closed trades / no losses.
function aggregateByStock(positions: ScannerPosition[]): StockBlock[] {
  const bySymbol = new Map<string, ScannerPosition[]>()
  for (const p of positions) {
    if (!p.symbol) continue
    const list = bySymbol.get(p.symbol)
    if (list) list.push(p)
    else bySymbol.set(p.symbol, [p])
  }

  const rows: StockBlock[] = []
  for (const [symbol, list] of bySymbol) {
    const strategies = Array.from(
      new Set(list.map((p) => p.strategy).filter(Boolean) as string[]),
    ).sort()

    let closedTrades = 0
    let openTrades = 0
    let wins = 0
    let rSum = 0
    let rCount = 0
    let grossWin = 0
    let grossLoss = 0
    let totalRealizedNet = 0
    let totalUnrealized = 0
    let active = false

    for (const p of list) {
      if (p.status === 'CLOSED') {
        closedTrades += 1
        const net = p.netPnl ?? 0
        totalRealizedNet += net
        if (net > 0) {
          wins += 1
          grossWin += net
        } else if (net < 0) {
          grossLoss += -net
        }
        if (typeof p.rMultiple === 'number' && !Number.isNaN(p.rMultiple)) {
          rSum += p.rMultiple
          rCount += 1
        }
      } else if (p.status === 'OPEN' || p.status === 'PENDING_ENTRY') {
        openTrades += 1
        active = true
        totalUnrealized += p.lastMark?.unrealizedPnl ?? 0
      }
    }

    rows.push({
      symbol,
      strategies,
      active,
      totalTrades: closedTrades + openTrades,
      closedTrades,
      openTrades,
      winRate: closedTrades > 0 ? wins / closedTrades : null,
      avgR: rCount > 0 ? rSum / rCount : null,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
      totalRealizedNet,
      totalUnrealized,
    })
  }

  // Active stocks first, then by absolute realized P&L, then alphabetically.
  rows.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const ap = Math.abs(a.totalRealizedNet ?? 0)
    const bp = Math.abs(b.totalRealizedNet ?? 0)
    if (ap !== bp) return bp - ap
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0
  })

  return rows
}

export async function listDays(): Promise<DayListItem[]> {
  await connectDB()
  const [runDocs, dailyDocs] = await Promise.all([
    ScannerRunModel.find({}).lean<Raw[]>().exec(),
    ScannerDailyStatModel.find({}).lean<Raw[]>().exec(),
  ])

  const runsByDate = new Map<string, Raw>()
  for (const r of runDocs ?? []) {
    if (r && typeof r.date === 'string') runsByDate.set(r.date, r)
  }
  const dailyByDate = new Map<string, Raw>()
  for (const s of dailyDocs ?? []) {
    if (s && typeof s.date === 'string') dailyByDate.set(s.date, s)
  }

  const dates = new Set<string>([...runsByDate.keys(), ...dailyByDate.keys()])
  const items: DayListItem[] = []
  for (const date of dates) {
    const run = runsByDate.get(date)
    const daily = dailyByDate.get(date)
    items.push({
      date,
      status: (run?.status as string) ?? 'unknown',
      signalCount: typeof run?.signalCount === 'number' ? run.signalCount : 0,
      entriesFilled: daily?.entriesFilled,
      exits: daily?.exits,
      openPositionCount: daily?.openPositionCount,
      equity: daily?.equity,
    })
  }

  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return items
}

export async function getDay(date: string): Promise<DayView> {
  await connectDB()
  const [runDoc, signalDocs] = await Promise.all([
    ScannerRunModel.findOne({ date }).lean<Raw>().exec(),
    ScannerSignalModel.find({ date, ...NOT_PATTERN })
      .sort({ rank: 1 })
      .lean<Raw[]>()
      .exec(),
  ])

  const signals = signalDocs ?? []
  const positionIds = signals
    .map((s) => s?.positionId ?? s?._id)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)

  const positionDocs = positionIds.length
    ? await ScannerPositionModel.find({ _id: { $in: positionIds } })
        .lean<Raw[]>()
        .exec()
    : []

  const positionsById = new Map<string, Raw>()
  for (const p of positionDocs ?? []) {
    if (p && p._id != null) positionsById.set(String(p._id), p)
  }

  const daySignals: DaySignal[] = signals.map((s) => {
    const signal = serializeSignal(s)
    const posDoc = positionsById.get(signal.positionId) ?? positionsById.get(signal.id)
    return {
      ...signal,
      position: posDoc ? serializePosition(posDoc) : null,
    }
  })

  return {
    run: runDoc ? serializeRun(runDoc) : null,
    signals: daySignals,
  }
}

export async function listPositions(
  filter: PositionsFilter,
): Promise<ScannerPosition[]> {
  await connectDB()
  const query: Raw = { ...NOT_PATTERN }
  if (filter.status) query.status = filter.status
  if (filter.strategy) query.strategy = filter.strategy
  if (filter.date) query.signalDate = filter.date

  const docs = await ScannerPositionModel.find(query).lean<Raw[]>().exec()
  const positions = (docs ?? []).map(serializePosition)

  // OPEN/PENDING first (ranked by entryDate DESC), then the rest by signalDate DESC.
  const isOpen = (p: ScannerPosition) =>
    p.status === 'OPEN' || p.status === 'PENDING_ENTRY'
  const desc = (a: string | null | undefined, b: string | null | undefined) => {
    const av = a ?? ''
    const bv = b ?? ''
    return av < bv ? 1 : av > bv ? -1 : 0
  }

  positions.sort((a, b) => {
    const ao = isOpen(a)
    const bo = isOpen(b)
    if (ao !== bo) return ao ? -1 : 1
    if (ao) return desc(a.entryDate, b.entryDate)
    return desc(a.signalDate, b.signalDate)
  })

  return positions
}

export async function getSignal(id: string): Promise<SignalView> {
  await connectDB()
  const [signalDoc, positionDoc] = await Promise.all([
    ScannerSignalModel.findById(id).lean<Raw>().exec(),
    ScannerPositionModel.findById(id).lean<Raw>().exec(),
  ])

  return {
    signal: signalDoc ? serializeSignal(signalDoc) : null,
    position: positionDoc ? serializePosition(positionDoc) : null,
  }
}

export async function getSettings(): Promise<ScannerSettings | null> {
  await connectDB()
  const doc = await ScannerSettingsModel.findById('singleton').lean<Raw>().exec()
  return doc ? serializeSettings(doc) : null
}

export async function updateSettings(
  patch: ScannerSettingsUpdate,
): Promise<ScannerSettings> {
  await connectDB()

  // Only $set the knob keys that were actually provided — never touch _id,
  // seededFrom, or createdAt. Upsert so a first-ever save creates the singleton.
  const allowed: (keyof ScannerSettingsUpdate)[] = [
    'capital',
    'riskPct',
    'riskPctOverrides',
    'entryModel',
    'gapHardCapPct',
    'minFillRR',
    'timeStopSessions',
    'tpMode',
    'slippageBps',
    'costs',
    'strategies',
    'watchlist',
    'blacklist',
  ]
  const set: Raw = {}
  for (const key of allowed) {
    const value = patch[key]
    if (value !== undefined) set[key] = value
  }

  const doc = await ScannerSettingsModel.findByIdAndUpdate(
    'singleton',
    { $set: set },
    { new: true, upsert: true, setDefaultsOnInsert: false },
  )
    .lean<Raw>()
    .exec()

  return serializeSettings(doc ?? { _id: 'singleton', ...set })
}

export async function getHealth(): Promise<HealthData> {
  await connectDB()
  const runDocs = await ScannerRunModel.find({})
    .sort({ date: -1 })
    .limit(15)
    .lean<Raw[]>()
    .exec()

  const runs = (runDocs ?? []).map(serializeRun)
  const latestRun = runs.length > 0 ? runs[0]! : null

  const lastRunDate = latestRun?.date ?? null
  const lastFinishedAt = latestRun?.finishedAt ?? null
  let ageHours: number | null = null
  if (lastFinishedAt) {
    const finished = new Date(lastFinishedAt).getTime()
    if (!Number.isNaN(finished)) {
      ageHours = (Date.now() - finished) / (1000 * 60 * 60)
    }
  }

  return {
    latestRun,
    recentRuns: runs,
    lastRunDate,
    lastFinishedAt,
    ageHours,
  }
}

// ── Intraday replay (sector-momentum + VWAP ORB) ────────────────────────────

import {
  ScannerIntradayRunModel,
  ScannerIntradayTradeModel,
  ScannerIntradayStatsModel,
  ScannerIntradayLiveModel,
} from './models'
import {
  serializeIntradayRun,
  serializeIntradayTrade,
  serializeIntradaySummary,
  serializeIntradayLive,
} from './serialize'
import type {
  IntradayOverview,
  IntradayDailyPoint,
  IntradayLiveDoc,
} from './types'

// Cumulative per-arm equity, one point per recorded session (the intraday
// pipeline publishes no daily-stats collection, so the curve is derived from
// the run docs' dayPnl fields). No-trade/failed sessions carry equity flat.
function buildIntradayDaily(runs: Raw[], capital: number): IntradayDailyPoint[] {
  let equityA = capital
  let equityB = capital
  const points: IntradayDailyPoint[] = []
  for (const r of runs) {
    if (!r || typeof r.date !== 'string' || !r.date) continue
    const dayPnlA = typeof r.dayPnlA === 'number' ? r.dayPnlA : 0
    const dayPnlB = typeof r.dayPnlB === 'number' ? r.dayPnlB : 0
    equityA += dayPnlA
    equityB += dayPnlB
    points.push({ date: r.date, dayPnlA, dayPnlB, equityA, equityB })
  }
  return points
}

async function computeIntradayOverview(): Promise<IntradayOverview> {
  await connectDB()
  const [summaryDoc, runDocs, tradeDocs, allRunDocs] = await Promise.all([
    ScannerIntradayStatsModel.findById('summary').lean<Raw>().exec(),
    ScannerIntradayRunModel.find({}).sort({ date: -1 }).limit(10).lean<Raw[]>().exec(),
    ScannerIntradayTradeModel.find({})
      .sort({ date: -1 })
      .limit(60)
      .lean<Raw[]>()
      .exec(),
    // Every session, oldest first, dayPnl fields only — feeds the equity curve.
    ScannerIntradayRunModel.find({}, { date: 1, dayPnlA: 1, dayPnlB: 1 })
      .sort({ date: 1 })
      .lean<Raw[]>()
      .exec(),
  ])
  const summary = summaryDoc ? serializeIntradaySummary(summaryDoc) : null
  return {
    summary,
    recentRuns: (runDocs ?? []).map(serializeIntradayRun),
    recentTrades: (tradeDocs ?? []).map(serializeIntradayTrade),
    daily: summary ? buildIntradayDaily(allRunDocs ?? [], summary.capital) : [],
  }
}

// The tab's landing aggregates (recent runs/trades, equity curve). The live
// "Right now" section reads getIntradayLive() separately and stays uncached, so
// a short window here only staggers the historical rollup, not live status.
export const getIntradayOverview = unstable_cache(
  computeIntradayOverview,
  ['scanner-intraday-overview'],
  { revalidate: 30 },
)

// Latest live-session doc (the Python live runner upserts _id = session date).
// Used server-side to seed the tab's "Right now" section, and by the polled
// /api/scanner/intraday/live route.
export async function getIntradayLive(): Promise<IntradayLiveDoc | null> {
  await connectDB()
  const doc = await ScannerIntradayLiveModel.findOne({})
    .sort({ _id: -1 })
    .lean<Raw>()
    .exec()
  return doc ? serializeIntradayLive(doc) : null
}

// ── Chart patterns (Phase 11) — the 3rd `/scanner` tab ──────────────────────
// Detections/positions are the SAME scannerSignals/scannerPositions collections
// tagged family='pattern' (D-1); the scoreboard is the scannerPatternStats
// singleton. Everything below is family-scoped so it never reads a swing doc.

import { ScannerPatternStatsModel } from './models'
import {
  serializePatternStats,
  serializePatternDetection,
} from './serialize'
import type {
  PatternsOverview,
  PatternDay,
  PatternDayCount,
  PatternDetectionRow,
  PatternSignalView,
  PatternHealth,
  ScannerDailyStat,
} from './types'

const IS_PATTERN = { family: 'pattern' }

// Realized paper equity by exit date, derived from the closed pattern positions
// (patterns publish no daily-stats collection). Shaped as ScannerDailyStat so
// the tab reuses the swing equity chart unchanged; drawdown is the running
// peak-minus-equity of this realized curve.
function buildPatternDaily(
  positions: ScannerPosition[],
  capital: number,
): ScannerDailyStat[] {
  const pnlByDate = new Map<string, number>()
  for (const p of positions) {
    if (p.status !== 'CLOSED' || !p.exitDate) continue
    pnlByDate.set(p.exitDate, (pnlByDate.get(p.exitDate) ?? 0) + (p.netPnl ?? 0))
  }
  const dates = [...pnlByDate.keys()].sort()
  let equity = capital
  let peak = capital
  let maxDrawdown = 0
  return dates.map((date) => {
    equity += pnlByDate.get(date) ?? 0
    peak = Math.max(peak, equity)
    maxDrawdown = Math.max(maxDrawdown, peak - equity)
    return { id: date, date, equity, maxDrawdownToDate: maxDrawdown }
  })
}

// Batch-load the paper positions for a set of detections and stitch each
// detection to its outcome (positionId == signal _id for patterns).
async function attachPositions(
  detections: ReturnType<typeof serializePatternDetection>[],
): Promise<PatternDetectionRow[]> {
  const ids = detections.map((d) => d.id).filter(Boolean)
  const posDocs = ids.length
    ? await ScannerPositionModel.find({ _id: { $in: ids }, ...IS_PATTERN })
        .lean<Raw[]>()
        .exec()
    : []
  const byId = new Map<string, Raw>()
  for (const p of posDocs ?? []) {
    if (p && p._id != null) byId.set(String(p._id), p)
  }
  return detections.map((d) => {
    const posDoc = byId.get(d.id)
    return { ...d, position: posDoc ? serializePosition(posDoc) : null }
  })
}

export async function getPatternDay(date: string): Promise<PatternDay> {
  await connectDB()
  const signalDocs = await ScannerSignalModel.find({ date, ...IS_PATTERN })
    .sort({ rank: 1 })
    .lean<Raw[]>()
    .exec()
  const detections = (signalDocs ?? []).map(serializePatternDetection)
  const rows = await attachPositions(detections)
  return {
    date,
    detections: rows,
    total: rows.length,
    tradable: rows.filter((r) => r.tradable).length,
  }
}

export async function getPatternsOverview(): Promise<PatternsOverview> {
  await connectDB()
  const [summaryDoc, dayCounts, positionDocs] = await Promise.all([
    ScannerPatternStatsModel.findById('summary').lean<Raw>().exec(),
    // Per-day detection counts (lightweight) for the recent-days strip.
    ScannerSignalModel.aggregate([
      { $match: { family: 'pattern' } },
      {
        $group: {
          _id: '$date',
          total: { $sum: 1 },
          tradable: {
            $sum: { $cond: [{ $eq: ['$extras.tradable', true] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 15 },
    ]).exec(),
    // Every pattern paper position — the Trade levels table + the derived
    // realized-equity curve both read from this.
    ScannerPositionModel.find({ ...IS_PATTERN }).lean<Raw[]>().exec(),
  ])

  const recentDays: PatternDayCount[] = (dayCounts ?? [])
    .map((r: Raw) => ({
      date: String(r._id ?? ''),
      total: typeof r.total === 'number' ? r.total : 0,
      tradable: typeof r.tradable === 'number' ? r.tradable : 0,
    }))
    .filter((d: PatternDayCount) => d.date)

  const lastDetectionDate = recentDays[0]?.date ?? null
  // The most recent detection day is shown in full on the tab; older days are the
  // count strip (links to /scanner/patterns/days/[date]).
  const latestDay = lastDetectionDate
    ? await getPatternDay(lastDetectionDate)
    : null

  const summary = summaryDoc ? serializePatternStats(summaryDoc) : null
  const positions = (positionDocs ?? []).map(serializePosition)

  return {
    summary,
    latestDay,
    recentDays,
    lastDetectionDate,
    totalDetections: recentDays.reduce((sum, d) => sum + d.total, 0),
    positions: sortPositionsForDisplay(positions),
    daily: summary ? buildPatternDaily(positions, summary.capital) : [],
  }
}

export async function getPatternSignal(id: string): Promise<PatternSignalView> {
  await connectDB()
  const [signalDoc, positionDoc] = await Promise.all([
    ScannerSignalModel.findOne({ _id: id, ...IS_PATTERN }).lean<Raw>().exec(),
    ScannerPositionModel.findOne({ _id: id, ...IS_PATTERN }).lean<Raw>().exec(),
  ])
  return {
    detection: signalDoc ? serializePatternDetection(signalDoc) : null,
    position: positionDoc ? serializePosition(positionDoc) : null,
  }
}

export async function getPatternsHealth(): Promise<PatternHealth> {
  await connectDB()
  const [summaryDoc, latestDocs] = await Promise.all([
    ScannerPatternStatsModel.findById('summary').lean<Raw>().exec(),
    ScannerSignalModel.find({ ...IS_PATTERN })
      .sort({ date: -1 })
      .limit(1)
      .lean<Raw[]>()
      .exec(),
  ])

  const latest = (latestDocs ?? [])[0] ?? null
  const lastDetectionDate = (latest?.date as string | undefined) ?? null
  const lastPublishedAt = latest ? serializeSignalStamp(latest.updatedAt) : null

  let ageHours: number | null = null
  if (lastPublishedAt) {
    const finished = new Date(lastPublishedAt).getTime()
    if (!Number.isNaN(finished)) ageHours = (Date.now() - finished) / 3_600_000
  }

  const detectionCountLastDay = lastDetectionDate
    ? await ScannerSignalModel.countDocuments({
        date: lastDetectionDate,
        ...IS_PATTERN,
      }).exec()
    : 0

  const summary = summaryDoc ? serializePatternStats(summaryDoc) : null
  const totalFills = summary
    ? summary.buckets.reduce(
        (sum, b) => sum + b.tradable.fills + b.untradable.fills,
        0,
      )
    : 0

  return {
    lastDetectionDate,
    lastPublishedAt,
    ageHours,
    detectionCountLastDay,
    asOf: summary?.asOf ?? null,
    bucketCount: summary?.bucketCount ?? 0,
    totalFills,
  }
}

// updatedAt on a pattern signal is a BSON Date (the publish wall-clock). Reuse
// the same defensive Date→ISO handling the serializers use.
function serializeSignalStamp(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  if (typeof v === 'string') return v
  return null
}
