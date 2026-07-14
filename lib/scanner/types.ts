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
  family?: string // 'swing' (default/absent) | 'pattern' — D-1 discriminator
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
  positions: ScannerPosition[]
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

// ── Intraday replay (sector-momentum + VWAP ORB) ────────────────────────────

export type IntradayArmStats = {
  trades: number
  wins: number
  winRate: number | null
  avgR: number | null
  netPnl: number
  equity: number
  grossPnl: number
  costs: number
}

export type IntradaySummary = {
  capital: number
  byArm: { A: IntradayArmStats; B: IntradayArmStats }
}

export type IntradaySectorRow = {
  key: string
  name: string
  pct920: number | null
  pct925: number | null
  proxy?: boolean
}

// A candidate that survived the whole checklist (build_candidates → `picks`).
export type IntradayPick = {
  symbol: string
  pct925: number | null
  rv: number | null
}

// A candidate dropped at some gate — `reason` is the exact engine string
// ("wrong side of VWAP", "not the top mover", "doji first bar", …).
export type IntradayReject = {
  symbol: string
  reason: string
  pct925?: number | null
}

export type IntradayRun = {
  date: string
  status: string
  noTradeReason?: string | null
  sector?: string | null
  direction?: string | null
  tradeCount?: number
  dayPnlA?: number | null
  dayPnlB?: number | null
  warnings?: string[]
  // The full decision record the publisher persists (publishing.py run_doc) —
  // surfaced so the site can show the sector ranking + pick funnel per session.
  sectorTable?: IntradaySectorRow[]
  picks?: IntradayPick[]
  rejects?: IntradayReject[]
}

export type IntradayTranche = {
  time: string
  price: number
  qty: number
  reason: string
}

export type IntradayTrade = {
  id: string
  date: string
  symbol: string
  arm: string | null
  direction: string
  sector?: string | null
  status: string
  rv?: number | null
  pct925?: number | null
  trigger?: number | null
  stop?: number | null
  entryTime?: string | null
  entry?: number | null
  qty?: number | null
  target?: number | null
  exitTime?: string | null
  exitReason?: string | null
  tranches?: IntradayTranche[]
  grossPnl?: number | null
  costs?: number | null
  netPnl?: number | null
  rMultiple?: number | null
  skipReason?: string | null
}

export type IntradayOverview = {
  summary: IntradaySummary | null
  recentRuns: IntradayRun[]
  recentTrades: IntradayTrade[]
}

// ── Intraday LIVE session (scannerIntradayLive, _id = session date) ──────────
// The Python live runner upserts the full session state on every transition plus
// a 30s heartbeat; the site polls it through /api/scanner/intraday/live. Shapes
// are what live.py/publish_live write — times are "HH:MM[:SS]" IST strings.

export type IntradayLiveArm = {
  target: number
  status: string // 'OPEN' | 'CLOSED'
  exitPrice: number | null
  exitTime: string | null
  exitReason: string | null
  grossPnl?: number
  costs?: number
  netPnl?: number
  rMultiple?: number | null
}

export type IntradayLiveState = {
  symbol: string
  direction: string
  status: string // ARMED | ENTERED | DONE | SKIPPED
  trigger: number
  stop: number
  qty: number
  rPerShare?: number
  entryTime: string | null
  entryPrice: number | null
  lastLtp: number | null
  lastLtpTime: string | null
  skipReason: string | null
  arms: Record<string, IntradayLiveArm>
  events: { time: string; type: string; detail: string }[]
}

export type IntradayLivePlan = {
  symbol: string
  rv?: number | null
  pct925?: number | null
  trigger?: number
  stop?: number
  qty?: number
}

export type IntradayLiveDoc = {
  id: string
  date: string
  phase: string // starting | setup | ranking-0920 | decided | live | done
  sector?: string | null
  direction?: string | null
  noTradeReason?: string | null
  plan?: IntradayLivePlan | null
  live?: IntradayLiveState | null
  sectorTable?: IntradaySectorRow[]
  picks?: IntradayPick[]
  rejects?: IntradayReject[]
  warnings?: string[]
  updatedAt?: string | null
}

// ── Chart patterns (Phase 11) — the 3rd `/scanner` tab ──────────────────────
// Detections are `scannerSignals`/`scannerPositions` docs tagged family='pattern'
// (D-1 reuse). The per-bucket forward-test scoreboard is its OWN collection,
// `scannerPatternStats` (never pooled with the swing scannerStats). Pattern
// geometry (necklines, trendlines, cup rims, pivots) rides the free-form
// `extras{}` on each detection signal; `serializePatternDetection` lifts it out.

// One (bucket, cohort) trade-quality block — `paper/stats._trade_block` extended
// with `fills` / ₹ `expectancy` / a verdict `status` (§10, pattern_stats.py).
// winRate/avgR are fractions/ratios (or null with no closed trades); expectancy
// is ₹ per closed trade.
export type PatternCohortBlock = {
  closedTrades: number
  openTrades: number
  fills: number
  winRate: number | null
  avgR: number | null
  profitFactor: number | null
  avgHoldSessions: number | null
  expectancy: number | null
  totalRealizedNet: number
  totalUnrealized: number
  status: string // 'ready' (>=30 fills) | 'accumulating'
}

// One detector's forward-test scoreboard row — tradable and untradable cohorts
// kept strictly separate (never pooled, §10).
export type PatternBucket = {
  key: string
  tier: string | null
  tradable: PatternCohortBlock
  untradable: PatternCohortBlock
}

export type PatternStatsSummary = {
  asOf: string | null // the paper evaluation session P
  capital: number
  bucketCount: number
  buckets: PatternBucket[]
}

// A single pattern detection (a family='pattern' scannerSignals doc). `strategy`
// is the detector/bucket key (e.g. `cup_handle`); `quality` is the per-pattern
// quality sub-score (0..100, D-3), NOT the swing composite. `geometry` is the
// raw overlay set the signal-detail chart draws (pivots/trendlines/levels), with
// positions expressed as bar indices relative to the detection frame.
export type PatternDetection = {
  id: string
  date: string
  symbol: string
  token: string
  strategy: string
  setup: string
  subSetup?: string | null
  tier: string | null
  quality: number
  qualityComponents: Record<string, number>
  buy?: number | null
  sl?: number | null
  tp1?: number | null
  tp2?: number | null
  rr?: number | null
  plannedQty: number
  riskPct?: number | null
  validitySessions?: number | null
  flags: string[]
  tradable: boolean
  series: string
  confirmDate: string | null
  measuredMove?: number | null
  geometry: Record<string, unknown>
  rank: number
  updatedAt?: string | null
}

// A detection joined to its paper position (the forward-test outcome) for the
// detections-by-day view — mirrors DaySignal.
export type PatternDetectionRow = PatternDetection & {
  position: ScannerPosition | null
}

export type PatternDay = {
  date: string
  detections: PatternDetectionRow[]
  total: number
  tradable: number
}

// Lightweight per-day count for the "recent days" strip (links to the day page).
export type PatternDayCount = {
  date: string
  total: number
  tradable: number
}

export type PatternsOverview = {
  summary: PatternStatsSummary | null
  latestDay: PatternDay | null
  recentDays: PatternDayCount[]
  lastDetectionDate: string | null
  totalDetections: number
}

export type PatternSignalView = {
  detection: PatternDetection | null
  position: ScannerPosition | null
}

export type PatternHealth = {
  lastDetectionDate: string | null
  lastPublishedAt: string | null
  ageHours: number | null
  detectionCountLastDay: number
  asOf: string | null
  bucketCount: number
  totalFills: number
}
