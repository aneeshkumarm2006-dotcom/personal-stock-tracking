import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import { sectorForSymbol } from '@/lib/portfolio/sectors'
import type {
  AlertConfig,
  AlertDirection,
  AlertStatus,
  ConditionType,
  Conviction,
  Exchange,
  WatchlistItemView,
} from '@/lib/watchlist/types'

// Shape of a `.lean()` WatchlistItem document (ObjectIds/Dates not yet
// serialized). Mongoose lean typing is loose, so the route casts to this.
// `type`/`config` are optional because `.lean()` reads DON'T apply schema
// defaults, so legacy alerts (no `type`) surface here as undefined → 'price'.
export type RawWatchlistAlert = {
  _id: unknown
  type?: ConditionType
  targetPrice?: number
  direction?: AlertDirection
  config?: AlertConfig
  status?: AlertStatus
  lastTriggeredAt?: Date | null
  lastTriggeredPrice?: number | null
  note?: string
}

export type RawWatchlistItem = {
  _id: unknown
  instrumentToken: string
  instrumentSymbol?: string
  exchange?: string
  name?: string
  tags?: string[]
  notes?: string
  targetBuyPrice?: number | null
  priceWhenAdded?: number | null
  conviction?: Conviction
  alerts?: RawWatchlistAlert[]
  createdAt?: Date | null
  updatedAt?: Date | null
}

function distanceToTargetPct(
  ltp: number | null,
  target: number | null,
): number | null {
  if (ltp === null || target === null || ltp <= 0) return null
  return Math.round(((target - ltp) / ltp) * 10000) / 100
}

// Pure: given raw items + the price/cross-tab inputs, produce the enriched
// view rows the table renders. Kept side-effect-free so it stays testable.
export function enrichWatchlistItems(
  rawItems: RawWatchlistItem[],
  snapshots: PriceSnapshotData[],
  portfolioTokens: Set<string>,
  strategyTokens: Set<string>,
): WatchlistItemView[] {
  const byToken = new Map<string, PriceSnapshotData>()
  for (const s of snapshots) byToken.set(s.token, s)

  return rawItems.map((i) => {
    const snap = byToken.get(i.instrumentToken)
    const ltp = typeof snap?.ltp === 'number' ? snap.ltp : null
    const target = typeof i.targetBuyPrice === 'number' ? i.targetBuyPrice : null
    const alerts = i.alerts ?? []
    return {
      _id: String(i._id),
      instrumentToken: i.instrumentToken,
      instrumentSymbol: i.instrumentSymbol ?? '',
      exchange: (i.exchange as Exchange) ?? 'NSE',
      name: i.name ?? '',
      tags: i.tags ?? [],
      notes: i.notes ?? '',
      targetBuyPrice: target,
      priceWhenAdded:
        typeof i.priceWhenAdded === 'number' ? i.priceWhenAdded : null,
      conviction: i.conviction ?? 'watching',
      alerts: alerts.map((a) => ({
        _id: String(a._id),
        type: a.type ?? 'price',
        targetPrice: typeof a.targetPrice === 'number' ? a.targetPrice : null,
        direction: a.direction ?? 'below',
        config: a.config ?? {},
        status: a.status ?? 'armed',
        lastTriggeredAt: a.lastTriggeredAt
          ? new Date(a.lastTriggeredAt).toISOString()
          : null,
        lastTriggeredPrice:
          typeof a.lastTriggeredPrice === 'number' ? a.lastTriggeredPrice : null,
        note: a.note ?? '',
      })),
      createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : null,
      updatedAt: i.updatedAt ? new Date(i.updatedAt).toISOString() : null,
      ltp,
      dayChangePct: typeof snap?.pctChange === 'number' ? snap.pctChange : null,
      distanceToTargetPct: distanceToTargetPct(ltp, target),
      snapshotFetchedAt: snap?.fetchedAt ? snap.fetchedAt.toISOString() : null,
      armedCount: alerts.filter((a) => (a.status ?? 'armed') === 'armed').length,
      triggeredCount: alerts.filter((a) => a.status === 'triggered').length,
      sector: sectorForSymbol(i.instrumentSymbol),
      inPortfolio: portfolioTokens.has(i.instrumentToken),
      inStrategy: strategyTokens.has(i.instrumentToken),
    }
  })
}
