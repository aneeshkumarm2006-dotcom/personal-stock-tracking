import type { HoldingData } from './holdings'
import type { PriceSnapshotData } from '@/lib/angelone/quotes'

export type EnrichedHolding = HoldingData & {
  currentPrice: number | null
  currentValue: number
  unrealizedPnL: number
  unrealizedPnLPct: number
  dayChangePct: number | null
  snapshotFetchedAt: Date | null
}

export type PortfolioSummary = {
  totalInvested: number
  totalCurrentValue: number
  totalUnrealizedPnL: number
  totalRealizedPnL: number
  overallReturnPct: number
  holdings: EnrichedHolding[]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function enrichHoldings(
  holdings: HoldingData[],
  snapshots: PriceSnapshotData[],
): EnrichedHolding[] {
  const byToken = new Map<string, PriceSnapshotData>()
  for (const s of snapshots) byToken.set(s.token, s)

  return holdings.map((h) => {
    const snap = byToken.get(h.instrumentToken)
    const currentPrice = snap?.ltp ?? null
    const currentValue =
      currentPrice !== null && h.netQty > 0 ? round2(h.netQty * currentPrice) : 0
    const unrealizedPnL =
      currentPrice !== null && h.netQty > 0
        ? round2(currentValue - h.totalInvested)
        : 0
    const unrealizedPnLPct =
      h.totalInvested > 0 ? round2((unrealizedPnL / h.totalInvested) * 100) : 0

    return {
      ...h,
      currentPrice,
      currentValue,
      unrealizedPnL,
      unrealizedPnLPct,
      dayChangePct: snap?.pctChange ?? null,
      snapshotFetchedAt: snap?.fetchedAt ?? null,
    }
  })
}

export function computeSummary(
  holdings: HoldingData[],
  snapshots: PriceSnapshotData[],
  // Fixed realized P&L carried over from trades that predate this ledger. Added
  // on top of the realized P&L derived from the current SELL transactions.
  realizedPnLBaseline = 0,
): PortfolioSummary {
  const enriched = enrichHoldings(holdings, snapshots)

  let totalInvested = 0
  let totalCurrentValue = 0
  let totalUnrealizedPnL = 0
  let totalRealizedPnL = realizedPnLBaseline

  for (const h of enriched) {
    totalInvested += h.totalInvested
    totalCurrentValue += h.currentValue
    totalUnrealizedPnL += h.unrealizedPnL
    totalRealizedPnL += h.realizedPnL
  }

  const baseInvested = totalInvested
  const overallReturnPct =
    baseInvested > 0
      ? round2(((totalUnrealizedPnL + totalRealizedPnL) / baseInvested) * 100)
      : 0

  return {
    totalInvested: round2(totalInvested),
    totalCurrentValue: round2(totalCurrentValue),
    totalUnrealizedPnL: round2(totalUnrealizedPnL),
    totalRealizedPnL: round2(totalRealizedPnL),
    overallReturnPct,
    holdings: enriched,
  }
}
