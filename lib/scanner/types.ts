// Serialized (client-safe) types for the scanner read-layer. Every `_id` becomes a
// string `id`; every BSON Date becomes an ISO string. Trading dates (date,
// signalDate, entryDate, exitDate, event.date, asOf) stay `YYYY-MM-DD` strings.
// Docs are minimal for holiday/failed runs and stub positions, so almost every
// field beyond the identity keys is optional/nullable.

export type ScannerStrategy =
  | 'breakout'
  | 'pullback'
  | 'trend_st_adx'
  | 'rs_momentum'
  | 'rsi_mr'

export type RunStatus = 'ok' | 'holiday' | 'no-signals' | 'failed'

export type PositionStatus =
  | 'PENDING_ENTRY'
  | 'OPEN'
  | 'CLOSED'
  | 'SKIPPED_GAP'

export type ExitReason =
  | 'SL'
  | 'TP1'
  | 'TP2'
  | 'TRAIL'
  | 'TIME'
  | 'RSI_EXIT'
  | 'REBAL_EXIT'
  | 'SLEEVE_EXIT'

export type EventType =
  | 'CREATED'
  | 'ENTRY'
  | 'SKIPPED_GAP'
  | 'SL'
  | 'TP1'
  | 'TP2'
  | 'TRAIL'
  | 'TIME'
  | 'RSI_EXIT'
  | 'REBAL_EXIT'
  | 'SLEEVE_EXIT'

export type CostModel = {
  brokeragePerOrder?: number
  brokerageMaxPct?: number
  sttPct?: number
  exchangeTxnPct?: number
  sebiPct?: number
  stampDutyBuyPct?: number
  gstPct?: number
  dpChargeSell?: number
}

export type StrategyToggles = {
  breakout?: boolean
  pullback?: boolean
  trend_st_adx?: boolean
  rs_momentum?: boolean
  rsi_mr?: boolean
}

export type ScannerSettings = {
  id: string
  capital?: number
  riskPct?: number
  riskPctOverrides?: Record<string, number>
  entryModel?: string
  gapHardCapPct?: number
  minFillRR?: number
  timeStopSessions?: number
  tpMode?: 'partial-trail' | 'tp1-full'
  slippageBps?: number
  costs?: CostModel
  strategies?: StrategyToggles
  watchlist?: string[]
  blacklist?: string[]
  seededFrom?: string
  createdAt?: string | null
}

export type ScannerRegime = {
  index?: string
  blocksLong?: boolean
  rsSleeveFlat?: boolean
  strengthPoints?: number
  above200dma?: boolean
  above20dmaLow?: boolean
  stale?: boolean
}

export type ScannerRun = {
  id: string
  date: string
  status: RunStatus | string
  startedAt?: string | null
  finishedAt?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  universeCount?: number | null
  gateFunnel?: Record<string, number> | null
  regime?: ScannerRegime | null
  signalCount?: number
  degraded?: boolean
  errors?: string[]
  warnings?: string[]
  engineVersion?: string | null
  configSnapshot?: Record<string, unknown> | null
}

export type ScannerSignal = {
  id: string
  date: string
  symbol: string
  token: string
  rank: number
  setup: string
  strategy: ScannerStrategy | string
  subSetup?: string | null
  score: number
  scoreBreakdown: Record<string, number>
  buy?: number | null
  sl?: number | null
  tp1?: number | null
  tp2?: number | null
  plannedQty: number
  riskPct?: number | null
  rr?: number | null
  validitySessions?: number | null
  flags: string[]
  snapshot: Record<string, number | null>
  extras: Record<string, unknown>
  positionId: string
  updatedAt?: string | null
}

export type ScannerEvent = {
  // stub variant carries `at` (ISO); evolved variant carries `date` (YYYY-MM-DD).
  at?: string | null
  date?: string | null
  type: EventType | string
  note?: string | null
  price?: number | null
  qty?: number | null
  gapPct?: number | null
  remainingRR?: number | null
}

export type ScannerLastMark = {
  date: string
  close: number
  unrealizedPnl: number
}

export type ScannerPosition = {
  id: string
  signalId: string
  signalDate: string
  symbol: string
  token: string
  strategy: ScannerStrategy | string
  setup: string
  status: PositionStatus | string
  buy?: number | null
  sl?: number | null
  tp1?: number | null
  tp2?: number | null
  plannedQty: number
  riskPct?: number | null
  entryDate?: string | null
  entryPrice?: number | null
  qty?: number | null
  exitDate?: string | null
  exitPrice?: number | null
  exitReason?: ExitReason | null
  daysHeld?: number | null
  grossPnl?: number | null
  costs?: number | null
  netPnl?: number | null
  rMultiple?: number | null
  mfe?: number | null
  mae?: number | null
  lastMark?: ScannerLastMark | null
  events: ScannerEvent[]
  createdAt?: string | null
}

export type ScannerDailyStat = {
  id: string
  date: string
  newSignals?: number
  entriesFilled?: number
  exits?: number
  openPositionCount?: number
  deployedCapital?: number
  realizedPnlToDate?: number
  unrealizedPnlEOD?: number
  equity?: number
  maxDrawdownToDate?: number
}

export type TradeBlock = {
  closedTrades?: number
  openTrades?: number
  winRate?: number | null
  avgR?: number | null
  profitFactor?: number | null
  avgHoldSessions?: number | null
  totalRealizedNet?: number
  totalUnrealized?: number
}

// Per-stock aggregation computed on the fly from positions (Python only publishes
// byStrategy). `active` is true when the stock currently holds an OPEN/PENDING
// position; strategies lists every strategy that has traded the symbol.
export type StockBlock = TradeBlock & {
  symbol: string
  strategies: string[]
  active: boolean
  totalTrades: number
}

export type ScannerStatsSummary = {
  id: string
  asOf?: string | null
  closedTrades?: number
  openTrades?: number
  winRate?: number | null
  avgR?: number | null
  profitFactor?: number | null
  avgHoldSessions?: number | null
  totalRealizedNet?: number
  totalUnrealized?: number
  equity?: number
  maxDrawdown?: number
  byStrategy?: Record<string, TradeBlock>
}

// --- Composite helper types (slices depend on these exact names) ---

export type DaySignal = ScannerSignal & { position: ScannerPosition | null }

export type DayView = {
  run: ScannerRun | null
  signals: DaySignal[]
}

export type DayListItem = {
  date: string
  status: string
  signalCount: number
  entriesFilled?: number
  exits?: number
  openPositionCount?: number
  equity?: number
}

export type OverviewData = {
  summary: ScannerStatsSummary | null
  daily: ScannerDailyStat[]
  recentRuns: ScannerRun[]
  openPositionsCount: number
  byStock: StockBlock[]
}

export type HealthData = {
  latestRun: ScannerRun | null
  recentRuns: ScannerRun[]
  lastRunDate: string | null
  lastFinishedAt: string | null
  ageHours: number | null
}

export type SignalView = {
  signal: ScannerSignal | null
  position: ScannerPosition | null
}

export type PositionsFilter = {
  status?: string
  strategy?: string
  date?: string
}
