// SERVER-ONLY. Imports the Mongoose read-models + connectDB, so this must never be
// pulled into a 'use client' bundle. Every function connects first, reads with
// .lean(), and returns already-serialized (client-safe) shapes from types.ts.

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

export async function getOverview(): Promise<OverviewData> {
  await connectDB()
  const [summaryDoc, dailyDocs, runDocs, openPositionsCount, positionDocs] =
    await Promise.all([
      ScannerStatsModel.findById('summary').lean<Raw>().exec(),
      ScannerDailyStatModel.find({}).sort({ date: 1 }).lean<Raw[]>().exec(),
      ScannerRunModel.find({}).sort({ date: -1 }).limit(10).lean<Raw[]>().exec(),
      ScannerPositionModel.countDocuments({ status: 'OPEN' }).exec(),
      ScannerPositionModel.find({}).lean<Raw[]>().exec(),
    ])

  return {
    summary: summaryDoc ? serializeSummary(summaryDoc) : null,
    daily: (dailyDocs ?? []).map(serializeDailyStat),
    recentRuns: (runDocs ?? []).map(serializeRun),
    openPositionsCount: openPositionsCount ?? 0,
    byStock: aggregateByStock((positionDocs ?? []).map(serializePosition)),
  }
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
    ScannerSignalModel.find({ date }).sort({ rank: 1 }).lean<Raw[]>().exec(),
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
  const query: Raw = {}
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
