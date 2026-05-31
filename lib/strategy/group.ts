import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import type { StrategyEntryStatus } from './evaluate'

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
  quantity: number
  status: StrategyEntryStatus
}

export type EntryStats = {
  id: string | null
  instrumentToken: string
  instrumentSymbol: string
  status: StrategyEntryStatus
  entryPrice: number
  stopLoss: number
  targetPrice: number
  quantity: number
  capitalUsed: number
  risk: number
  reward: number
  rr: number
  currentPrice: number | null
  unrealizedPnL: number
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
    tp_hit: 0,
    sl_hit: 0,
    closed_manual: 0,
  }
}

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

    const capitalUsed = round2(e.entryPrice * e.quantity)
    const risk = round2((e.entryPrice - e.stopLoss) * e.quantity)
    const reward = round2((e.targetPrice - e.entryPrice) * e.quantity)
    const rr = risk > 0 ? round2(reward / risk) : 0

    if (e.status === 'pending' || e.status === 'active') {
      capitalDeployed += capitalUsed
    }

    const ltp = ltpByToken.get(e.instrumentToken)
    const currentPrice = typeof ltp === 'number' ? ltp : null
    const unrealizedPnL =
      e.status === 'active' && currentPrice !== null
        ? round2((currentPrice - e.entryPrice) * e.quantity)
        : 0

    enriched.push({
      id: e._id != null ? String(e._id) : null,
      instrumentToken: e.instrumentToken,
      instrumentSymbol: e.instrumentSymbol ?? '',
      status: e.status,
      entryPrice: e.entryPrice,
      stopLoss: e.stopLoss,
      targetPrice: e.targetPrice,
      quantity: e.quantity,
      capitalUsed,
      risk,
      reward,
      rr,
      currentPrice,
      unrealizedPnL,
    })
  }

  const decided = entryCountByStatus.tp_hit + entryCountByStatus.sl_hit
  const winRate = decided > 0 ? round2(entryCountByStatus.tp_hit / decided) : 0

  return {
    allocatedCapital: round2(group.allocatedCapital),
    capitalDeployed: round2(capitalDeployed),
    capitalFree: round2(group.allocatedCapital - capitalDeployed),
    entryCountByStatus,
    winRate,
    entries: enriched,
  }
}
