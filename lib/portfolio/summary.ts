import type { HoldingData } from './holdings'
import type { PriceSnapshotData } from '@/lib/angelone/quotes'

export type EnrichedHolding = HoldingData & {
  currentPrice: number | null
  currentValue: number
  unrealizedPnL: number
  unrealizedPnLPct: number
  dayChange: number
  dayChangePct: number | null
  snapshotFetchedAt: Date | null
}

export type PortfolioSummary = {
  totalInvested: number
  totalCurrentValue: number
  totalUnrealizedPnL: number
  totalRealizedPnL: number
  totalDayChange: number
  dayChangePct: number
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

    // Today's change in cash terms: prefer the per-share netChange from the
    // snapshot, fall back to (ltp - previous close) when netChange is missing.
    const perShareChange =
      snap?.netChange ??
      (currentPrice !== null && snap?.close !== undefined
        ? currentPrice - snap.close
        : undefined)
    const dayChange =
      currentPrice !== null && h.netQty > 0 && perShareChange !== undefined
        ? round2(h.netQty * perShareChange)
        : 0

    return {
      ...h,
      currentPrice,
      currentValue,
      unrealizedPnL,
      unrealizedPnLPct,
      dayChange,
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
  let totalDayChange = 0
  let totalPrevCloseValue = 0

  for (const h of enriched) {
    totalInvested += h.totalInvested
    totalCurrentValue += h.currentValue
    totalUnrealizedPnL += h.unrealizedPnL
    totalRealizedPnL += h.realizedPnL
    totalDayChange += h.dayChange
    totalPrevCloseValue += h.currentValue - h.dayChange
  }

  const baseInvested = totalInvested
  const overallReturnPct =
    baseInvested > 0
      ? round2(((totalUnrealizedPnL + totalRealizedPnL) / baseInvested) * 100)
      : 0
  const dayChangePct =
    totalPrevCloseValue > 0
      ? round2((totalDayChange / totalPrevCloseValue) * 100)
      : 0

  return {
    totalInvested: round2(totalInvested),
    totalCurrentValue: round2(totalCurrentValue),
    totalUnrealizedPnL: round2(totalUnrealizedPnL),
    totalRealizedPnL: round2(totalRealizedPnL),
    totalDayChange: round2(totalDayChange),
    dayChangePct,
    overallReturnPct,
    holdings: enriched,
  }
}
