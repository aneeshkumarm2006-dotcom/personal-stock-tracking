import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import {
  currentStop,
  exitMode,
  realizedPnL,
  type ExitMode,
  type StrategyEntryStatus,
  type StrategyEvent,
  type TriggerType,
} from './evaluate'

export type GroupForStats = {
  allocatedCapital: number
}

export type EntryForStats = {
  _id?: unknown
  instrumentToken: string
  instrumentSymbol?: string | null
  entryPrice: number
  stopLoss: number
  targetPrice: number
  target2?: number | null
  quantity: number
  soldQuantity?: number
  peakPrice?: number | null
  triggerType?: TriggerType | null
  status: StrategyEntryStatus
  events?: StrategyEvent[]
}

export type EntryStats = {
  id: string | null
  instrumentToken: string
  instrumentSymbol: string
  status: StrategyEntryStatus
  exitMode: ExitMode
  triggerType: TriggerType
  entryPrice: number
  stopLoss: number
  // Live protective stop: trails up for a trailing entry, breakeven for a
  // scaled-out remainder, original SL otherwise.
  activeStop: number
  targetPrice: number
  target2: number | null
  quantity: number
  soldQuantity: number
  remainingQuantity: number
  capitalUsed: number
  risk: number
  reward: number
  rr: number
  currentPrice: number | null
  realizedPnL: number
  unrealizedPnL: number
  totalPnL: number
}

export type GroupStats = {
  allocatedCapital: number
  capitalDeployed: number
  capitalFree: number
  entryCountByStatus: Record<StrategyEntryStatus, number>
  winRate: number
  entries: EntryStats[]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function emptyCounts(): Record<StrategyEntryStatus, number> {
  return {
    pending: 0,
    active: 0,
    partial: 0,
    trailing: 0,
    tp_hit: 0,
    sl_hit: 0,
    trail_hit: 0,
    closed_manual: 0,
    expired: 0,
  }
}

const DEPLOYED_STATUSES = new Set<StrategyEntryStatus>([
  'pending',
  'active',
  'partial',
  'trailing',
])

const RUNNING_STATUSES = new Set<StrategyEntryStatus>([
  'active',
  'partial',
  'trailing',
])

export function computeGroupStats(
  group: GroupForStats,
  entries: EntryForStats[],
  snapshots: PriceSnapshotData[],
): GroupStats {
  const ltpByToken = new Map<string, number>()
  for (const s of snapshots) {
    if (typeof s.ltp === 'number') ltpByToken.set(s.token, s.ltp)
  }

  const entryCountByStatus = emptyCounts()
  let capitalDeployed = 0
  const enriched: EntryStats[] = []

  for (const e of entries) {
    entryCountByStatus[e.status] = (entryCountByStatus[e.status] ?? 0) + 1

    const soldQuantity = e.soldQuantity ?? 0
    const remainingQuantity = Math.max(0, e.quantity - soldQuantity)
    const capitalUsed = round2(e.entryPrice * e.quantity)
    const risk = round2((e.entryPrice - e.stopLoss) * e.quantity)
    const reward = round2((e.targetPrice - e.entryPrice) * e.quantity)
    const rr = risk > 0 ? round2(reward / risk) : 0

    if (DEPLOYED_STATUSES.has(e.status)) {
      capitalDeployed += round2(e.entryPrice * remainingQuantity)
    }

    const ltp = ltpByToken.get(e.instrumentToken)
    const currentPrice = typeof ltp === 'number' ? ltp : null

    const realized = realizedPnL(e.entryPrice, e.events ?? [])
    const unrealized =
      RUNNING_STATUSES.has(e.status) && currentPrice !== null
        ? round2((currentPrice - e.entryPrice) * remainingQuantity)
        : 0

    enriched.push({
      id: e._id != null ? String(e._id) : null,
      instrumentToken: e.instrumentToken,
      instrumentSymbol: e.instrumentSymbol ?? '',
      status: e.status,
      exitMode: exitMode(e),
      triggerType: e.triggerType ?? 'limit',
      entryPrice: e.entryPrice,
      stopLoss: e.stopLoss,
      activeStop: round2(currentStop(e)),
      targetPrice: e.targetPrice,
      target2: e.target2 ?? null,
      quantity: e.quantity,
      soldQuantity,
      remainingQuantity,
      capitalUsed,
      risk,
      reward,
      rr,
      currentPrice,
      realizedPnL: realized,
      unrealizedPnL: unrealized,
      totalPnL: round2(realized + unrealized),
    })
  }

  const wins = entryCountByStatus.tp_hit + entryCountByStatus.trail_hit
  const decided = wins + entryCountByStatus.sl_hit
  const winRate = decided > 0 ? round2(wins / decided) : 0

  return {
    allocatedCapital: round2(group.allocatedCapital),
    capitalDeployed: round2(capitalDeployed),
    capitalFree: round2(group.allocatedCapital - capitalDeployed),
    entryCountByStatus,
    winRate,
    entries: enriched,
  }
}
