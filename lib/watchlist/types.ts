// Shared view types for the Watchlist tab — safe to import from both the API
// routes (server) and the React components (client). No runtime/server deps.

export type Conviction = 'watching' | 'interested' | 'high'
export type Exchange = 'NSE' | 'BSE'
export type AlertDirection = 'below' | 'above'
export type AlertStatus = 'armed' | 'triggered' | 'snoozed' | 'disabled'

// An embedded alert as returned by the API (ObjectIds/Dates serialized).
export type WatchlistAlertView = {
  _id: string
  targetPrice: number
  direction: AlertDirection
  status: AlertStatus
  lastTriggeredAt: string | null
  lastTriggeredPrice: number | null
  note: string
}

// A watchlist item enriched with the latest price snapshot + cross-tab flags.
export type WatchlistItemView = {
  _id: string
  instrumentToken: string
  instrumentSymbol: string
  exchange: Exchange
  name: string
  tags: string[]
  notes: string
  targetBuyPrice: number | null
  priceWhenAdded: number | null
  conviction: Conviction
  alerts: WatchlistAlertView[]
  createdAt: string | null
  updatedAt: string | null
  // --- enriched (not stored) ---
  ltp: number | null
  dayChangePct: number | null
  // +ve: price must RISE to reach the target (render ▲); -ve: price must FALL
  // into the buy zone (render ▼). null when no target or no live price.
  distanceToTargetPct: number | null
  snapshotFetchedAt: string | null
  armedCount: number
  triggeredCount: number
  sector: string
  inPortfolio: boolean
  inStrategy: boolean
}

export type WatchlistListResponse = {
  items: WatchlistItemView[]
  oldestFetchedAt: string | null
}
