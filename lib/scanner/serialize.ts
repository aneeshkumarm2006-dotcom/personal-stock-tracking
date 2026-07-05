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
