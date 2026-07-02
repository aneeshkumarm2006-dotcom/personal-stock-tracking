// Shared view types for the Watchlist tab — safe to import from both the API
// routes (server) and the React components (client). No runtime/server deps.

import type {
  AlertConfig,
  AlertDirection,
  AlertStatus,
  ConditionType,
} from '@/lib/alerts/types'

export type Conviction = 'watching' | 'interested' | 'high'
export type Exchange = 'NSE' | 'BSE'
// Re-exported from the canonical alert-types home so the many existing importers
// of these from '@/lib/watchlist/types' keep working.
export type { AlertConfig, AlertDirection, AlertStatus, ConditionType }

// An embedded alert as returned by the API (ObjectIds/Dates serialized). `type`
// discriminates the condition; `targetPrice`/`direction` are only guaranteed for
// the legacy `price` type (hence optional), and `config` carries the parameters
// for every other type.
export type WatchlistAlertView = {
  _id: string
  type: ConditionType
  targetPrice: number | null
  direction: AlertDirection
  config: AlertConfig
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
