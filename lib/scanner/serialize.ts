import type {
  ScannerSignal,
  ScannerPosition,
  ScannerRun,
  ScannerDailyStat,
  ScannerStatsSummary,
  ScannerSettings,
  ScannerEvent,
  ScannerLastMark,
  ScannerRegime,
  CostModel,
  StrategyToggles,
  TradeBlock,
} from './types'

// Defensive serializers: raw lean docs → typed client-safe shapes. They must
// NEVER throw on missing/odd fields — default arrays to [], keep nulls, and only
// touch fields we know. Free-form maps (scoreBreakdown, snapshot, extras,
// gateFunnel, configSnapshot) pass through as-is.

type Raw = Record<string, any>

// String()-ify an _id (ObjectId or string). Returns '' when absent.
function toId(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

// Convert a value to an ISO string ONLY when it is an actual Date (BSON dates come
// back as JS Date via .lean()). Leave YYYY-MM-DD strings and everything else
// untouched; return null for null/undefined.
function toISO(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString()
  }
  if (typeof v === 'string') return v
  return null
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function asRecord(v: unknown): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {}
}

export function serializeSignal(raw: Raw): ScannerSignal {
  const d = raw ?? {}
  return {
    id: toId(d._id),
    date: d.date ?? '',
    family: d.family ?? 'swing',
    symbol: d.symbol ?? '',
    token: d.token != null ? String(d.token) : '',
    rank: typeof d.rank === 'number' ? d.rank : 0,
    setup: d.setup ?? '',
    strategy: d.strategy ?? '',
    subSetup: d.subSetup ?? null,
    score: typeof d.score === 'number' ? d.score : 0,
    scoreBreakdown: asRecord(d.scoreBreakdown),
    buy: d.buy ?? null,
    sl: d.sl ?? null,
    tp1: d.tp1 ?? null,
    tp2: d.tp2 ?? null,
    plannedQty: typeof d.plannedQty === 'number' ? d.plannedQty : 0,
    riskPct: d.riskPct ?? null,
    rr: d.rr ?? null,
    validitySessions: d.validitySessions ?? null,
    flags: asArray<string>(d.flags),
    snapshot: asRecord(d.snapshot),
    extras: asRecord(d.extras),
    positionId: d.positionId ?? toId(d._id),
    updatedAt: toISO(d.updatedAt),
  }
}

function serializeEvent(raw: Raw): ScannerEvent {
  const e = raw ?? {}
  return {
    at: toISO(e.at),
    date: e.date ?? null,
    type: e.type ?? '',
    note: e.note ?? null,
    price: e.price ?? null,
    qty: e.qty ?? null,
    gapPct: e.gapPct ?? null,
    remainingRR: e.remainingRR ?? null,
  }
}

function serializeLastMark(raw: unknown): ScannerLastMark | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Raw
  if (m.date == null && m.close == null && m.unrealizedPnl == null) return null
  return {
    date: m.date ?? '',
    close: typeof m.close === 'number' ? m.close : 0,
    unrealizedPnl: typeof m.unrealizedPnl === 'number' ? m.unrealizedPnl : 0,
  }
}

export function serializePosition(raw: Raw): ScannerPosition {
  const d = raw ?? {}
  return {
    id: toId(d._id),
    signalId: d.signalId ?? toId(d._id),
    signalDate: d.signalDate ?? '',
    symbol: d.symbol ?? '',
    token: d.token != null ? String(d.token) : '',
    strategy: d.strategy ?? '',
    setup: d.setup ?? '',
    status: d.status ?? '',
    buy: d.buy ?? null,
    sl: d.sl ?? null,
    tp1: d.tp1 ?? null,
    tp2: d.tp2 ?? null,
    plannedQty: typeof d.plannedQty === 'number' ? d.plannedQty : 0,
    riskPct: d.riskPct ?? null,
    entryDate: d.entryDate ?? null,
    entryPrice: d.entryPrice ?? null,
    qty: d.qty ?? null,
    exitDate: d.exitDate ?? null,
    exitPrice: d.exitPrice ?? null,
    exitReason: d.exitReason ?? null,
    daysHeld: d.daysHeld ?? null,
    grossPnl: d.grossPnl ?? null,
    costs: d.costs ?? null,
    netPnl: d.netPnl ?? null,
    rMultiple: d.rMultiple ?? null,
    mfe: d.mfe ?? null,
    mae: d.mae ?? null,
    lastMark: serializeLastMark(d.lastMark),
    events: asArray<Raw>(d.events).map(serializeEvent),
    createdAt: toISO(d.createdAt),
  }
}

function serializeRegime(raw: unknown): ScannerRegime | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Raw
  return {
    index: r.index,
    blocksLong: r.blocksLong,
    rsSleeveFlat: r.rsSleeveFlat,
    strengthPoints: r.strengthPoints,
    above200dma: r.above200dma,
    above20dmaLow: r.above20dmaLow,
    stale: r.stale,
  }
}

export function serializeRun(raw: Raw): ScannerRun {
  const d = raw ?? {}
  return {
    id: toId(d._id),
    date: d.date ?? '',
    status: d.status ?? 'unknown',
    startedAt: toISO(d.startedAt),
    finishedAt: toISO(d.finishedAt),
    publishedAt: toISO(d.publishedAt),
    updatedAt: toISO(d.updatedAt),
    universeCount: d.universeCount ?? null,
    gateFunnel: d.gateFunnel ?? null,
    regime: serializeRegime(d.regime),
    signalCount: typeof d.signalCount === 'number' ? d.signalCount : 0,
    degraded: d.degraded === true,
    errors: asArray<string>(d.errors),
    warnings: asArray<string>(d.warnings),
    engineVersion: d.engineVersion ?? null,
    configSnapshot: d.configSnapshot ?? null,
  }
}

export function serializeDailyStat(raw: Raw): ScannerDailyStat {
  const d = raw ?? {}
  return {
    id: toId(d._id),
    date: d.date ?? '',
    newSignals: d.newSignals,
    entriesFilled: d.entriesFilled,
    exits: d.exits,
    openPositionCount: d.openPositionCount,
    deployedCapital: d.deployedCapital,
    realizedPnlToDate: d.realizedPnlToDate,
    unrealizedPnlEOD: d.unrealizedPnlEOD,
    equity: d.equity,
    maxDrawdownToDate: d.maxDrawdownToDate,
  }
}

function serializeTradeBlock(raw: unknown): TradeBlock {
  const b = asRecord(raw)
  return {
    closedTrades: b.closedTrades,
    openTrades: b.openTrades,
    winRate: b.winRate ?? null,
    avgR: b.avgR ?? null,
    profitFactor: b.profitFactor ?? null,
    avgHoldSessions: b.avgHoldSessions ?? null,
    totalRealizedNet: b.totalRealizedNet,
    totalUnrealized: b.totalUnrealized,
  }
}

export function serializeSummary(raw: Raw): ScannerStatsSummary {
  const d = raw ?? {}
  const byStrategyRaw = asRecord(d.byStrategy)
  const byStrategy: Record<string, TradeBlock> = {}
  for (const key of Object.keys(byStrategyRaw)) {
    byStrategy[key] = serializeTradeBlock(byStrategyRaw[key])
  }
  return {
    id: toId(d._id),
    asOf: d.asOf ?? null,
    closedTrades: d.closedTrades,
    openTrades: d.openTrades,
    winRate: d.winRate ?? null,
    avgR: d.avgR ?? null,
    profitFactor: d.profitFactor ?? null,
    avgHoldSessions: d.avgHoldSessions ?? null,
    totalRealizedNet: d.totalRealizedNet,
    totalUnrealized: d.totalUnrealized,
    equity: d.equity,
    maxDrawdown: d.maxDrawdown,
    byStrategy,
  }
}

export function serializeSettings(raw: Raw): ScannerSettings {
  const d = raw ?? {}
  return {
    id: toId(d._id),
    capital: d.capital,
    riskPct: d.riskPct,
    riskPctOverrides: asRecord(d.riskPctOverrides) as Record<string, number>,
    entryModel: d.entryModel,
    gapHardCapPct: d.gapHardCapPct,
    minFillRR: d.minFillRR,
    timeStopSessions: d.timeStopSessions,
    tpMode: d.tpMode,
    slippageBps: d.slippageBps,
    costs: (d.costs ?? undefined) as CostModel | undefined,
    strategies: (d.strategies ?? undefined) as StrategyToggles | undefined,
    watchlist: asArray<string>(d.watchlist),
    blacklist: asArray<string>(d.blacklist),
    seededFrom: d.seededFrom,
    createdAt: toISO(d.createdAt),
  }
}

// ── Intraday replay serializers ─────────────────────────────────────────────

import type { IntradayRun, IntradaySummary, IntradayTrade } from './types'

export function serializeIntradayRun(doc: Raw): IntradayRun {
  return {
    date: doc.date ?? '',
    status: doc.status ?? 'unknown',
    noTradeReason: doc.noTradeReason ?? null,
    sector: doc.sector ?? null,
    direction: doc.direction ?? null,
    tradeCount: typeof doc.tradeCount === 'number' ? doc.tradeCount : 0,
    dayPnlA: typeof doc.dayPnlA === 'number' ? doc.dayPnlA : null,
    dayPnlB: typeof doc.dayPnlB === 'number' ? doc.dayPnlB : null,
    warnings: Array.isArray(doc.warnings) ? doc.warnings.map(String) : [],
  }
}

export function serializeIntradayTrade(doc: Raw): IntradayTrade {
  return {
    id: toId(doc._id),
    date: doc.date ?? '',
    symbol: doc.symbol ?? '',
    arm: doc.arm ?? null,
    direction: doc.direction ?? '',
    sector: doc.sector ?? null,
    status: doc.status ?? '',
    rv: doc.rv ?? null,
    pct925: doc.pct925 ?? null,
    trigger: doc.trigger ?? null,
    stop: doc.stop ?? null,
    entryTime: doc.entryTime ?? null,
    entry: doc.entry ?? null,
    qty: doc.qty ?? null,
    target: doc.target ?? null,
    exitTime: doc.exitTime ?? null,
    exitReason: doc.exitReason ?? null,
    tranches: Array.isArray(doc.tranches) ? doc.tranches : [],
    grossPnl: doc.grossPnl ?? null,
    costs: doc.costs ?? null,
    netPnl: doc.netPnl ?? null,
    rMultiple: doc.rMultiple ?? null,
    skipReason: doc.skipReason ?? null,
  }
}

export function serializeIntradaySummary(doc: Raw): IntradaySummary | null {
  if (!doc || !doc.byArm) return null
  const arm = (a: Raw | undefined) => ({
    trades: a?.trades ?? 0,
    wins: a?.wins ?? 0,
    winRate: a?.winRate ?? null,
    avgR: a?.avgR ?? null,
    netPnl: a?.netPnl ?? 0,
    equity: a?.equity ?? 0,
    grossPnl: a?.grossPnl ?? 0,
    costs: a?.costs ?? 0,
  })
  return {
    capital: doc.capital ?? 0,
    byArm: { A: arm(doc.byArm.A), B: arm(doc.byArm.B) },
  }
}

// ── Chart-pattern serializers (Phase 11) ────────────────────────────────────

import type {
  PatternDetection,
  PatternCohortBlock,
  PatternBucket,
  PatternStatsSummary,
} from './types'

// Meta keys the publisher stores on a pattern signal's `extras{}` alongside the
// geometry — lifted into first-class fields, then stripped so `geometry` is the
// pure overlay set (pivots / trendlines / levels + measured_move).
const PATTERN_EXTRA_META = new Set([
  'quality',
  'tier',
  'confirm_date',
  'confirm_pos',
  'tradable',
  'series',
])

function toNum(v: unknown): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null
}

// A family='pattern' scannerSignals lean doc → the typed detection. Geometry,
// tier, quality sub-score, tradability and confirm bar all ride `extras{}`
// (publish.py::_signal_extras); everything not a known meta key is geometry.
export function serializePatternDetection(raw: Raw): PatternDetection {
  const d = raw ?? {}
  const extras = asRecord(d.extras)
  const qualityBlock = asRecord(extras.quality)
  const geometry: Record<string, unknown> = {}
  for (const key of Object.keys(extras)) {
    if (!PATTERN_EXTRA_META.has(key)) geometry[key] = extras[key]
  }
  // extras.quality.components is the canonical breakdown; publish.py also mirrors
  // it to scoreBreakdown, so fall back there only if the quality block is empty.
  const qc = asRecord(qualityBlock.components)
  const components = (
    Object.keys(qc).length ? qc : asRecord(d.scoreBreakdown)
  ) as Record<string, number>
  return {
    id: toId(d._id),
    date: d.date ?? '',
    symbol: d.symbol ?? '',
    token: d.token != null ? String(d.token) : '',
    strategy: d.strategy ?? '',
    setup: d.setup ?? d.strategy ?? '',
    subSetup: d.subSetup ?? null,
    tier: (extras.tier as string | undefined) ?? null,
    quality:
      typeof d.score === 'number' ? d.score : (toNum(qualityBlock.score) ?? 0),
    qualityComponents: components,
    buy: d.buy ?? null,
    sl: d.sl ?? null,
    tp1: d.tp1 ?? null,
    tp2: d.tp2 ?? null,
    rr: d.rr ?? null,
    plannedQty: typeof d.plannedQty === 'number' ? d.plannedQty : 0,
    riskPct: d.riskPct ?? null,
    validitySessions: d.validitySessions ?? null,
    flags: asArray<string>(d.flags),
    tradable: extras.tradable !== false,
    series: (extras.series as string | undefined) ?? 'EQ',
    confirmDate: (extras.confirm_date as string | undefined) ?? null,
    measuredMove: toNum(geometry.measured_move),
    geometry,
    rank: typeof d.rank === 'number' ? d.rank : 0,
    updatedAt: toISO(d.updatedAt),
  }
}

function serializePatternCohort(raw: unknown): PatternCohortBlock {
  const b = asRecord(raw)
  return {
    closedTrades: typeof b.closedTrades === 'number' ? b.closedTrades : 0,
    openTrades: typeof b.openTrades === 'number' ? b.openTrades : 0,
    fills: typeof b.fills === 'number' ? b.fills : 0,
    winRate: b.winRate ?? null,
    avgR: b.avgR ?? null,
    profitFactor: b.profitFactor ?? null,
    avgHoldSessions: b.avgHoldSessions ?? null,
    expectancy: b.expectancy ?? null,
    totalRealizedNet: typeof b.totalRealizedNet === 'number' ? b.totalRealizedNet : 0,
    totalUnrealized: typeof b.totalUnrealized === 'number' ? b.totalUnrealized : 0,
    status: (b.status as string | undefined) ?? 'accumulating',
  }
}

export function serializePatternStats(raw: Raw): PatternStatsSummary {
  const d = raw ?? {}
  const byBucketRaw = asRecord(d.byBucket)
  const buckets: PatternBucket[] = Object.keys(byBucketRaw)
    .sort()
    .map((key) => {
      const b = asRecord(byBucketRaw[key])
      return {
        key,
        tier: (b.tier as string | undefined) ?? null,
        tradable: serializePatternCohort(b.tradable),
        untradable: serializePatternCohort(b.untradable),
      }
    })
  return {
    asOf: d.asOf ?? null,
    capital: typeof d.capital === 'number' ? d.capital : 0,
    bucketCount: typeof d.buckets === 'number' ? d.buckets : buckets.length,
    buckets,
  }
}
