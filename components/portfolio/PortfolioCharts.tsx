'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AllocationByInstrumentPie,
  type AllocationByInstrumentDatum,
} from '@/components/charts/AllocationByInstrumentPie'
import {
  AllocationBySectorPie,
  type AllocationBySectorDatum,
} from '@/components/charts/AllocationBySectorPie'
import {
  InstrumentPnLBar,
  type InstrumentPnLDatum,
} from '@/components/charts/InstrumentPnLBar'
import {
  PortfolioValueArea,
  type PortfolioValueDatum,
} from '@/components/charts/PortfolioValueArea'
import { sectorForSymbol } from '@/lib/portfolio/sectors'
import type { EnrichedHolding } from '@/lib/portfolio/summary'

type HoldingsResponse = {
  holdings: EnrichedHolding[]
}

type HistorySnapshot = {
  date: string
  totalValue?: number
  totalInvested?: number
}

async function fetchHoldings(): Promise<HoldingsResponse> {
  const res = await fetch('/api/holdings', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  return (await res.json()) as HoldingsResponse
}

async function fetchHistory(days: number): Promise<HistorySnapshot[]> {
  const res = await fetch(`/api/portfolio/history?days=${days}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as HistorySnapshot[]
  return Array.isArray(data) ? data : []
}

export function PortfolioCharts() {
  const holdingsQuery = useQuery({ queryKey: ['holdings'], queryFn: fetchHoldings })
  const historyQuery = useQuery({
    queryKey: ['portfolio-history', 90],
    queryFn: () => fetchHistory(90),
  })

  const allocationByInstrument: AllocationByInstrumentDatum[] = useMemo(() => {
    const holdings = holdingsQuery.data?.holdings ?? []
    return holdings
      .filter((h) => !h.isClosed && h.currentValue > 0)
      .map((h) => ({
        instrumentToken: h.instrumentToken,
        instrumentSymbol: h.instrumentSymbol || h.instrumentToken,
        currentValue: h.currentValue,
      }))
      .sort((a, b) => b.currentValue - a.currentValue)
  }, [holdingsQuery.data])

  const allocationBySector: AllocationBySectorDatum[] = useMemo(() => {
    const holdings = holdingsQuery.data?.holdings ?? []
    const totals = new Map<string, number>()
    for (const h of holdings) {
      if (h.isClosed || h.currentValue <= 0) continue
      const sector = sectorForSymbol(h.instrumentSymbol)
      totals.set(sector, (totals.get(sector) ?? 0) + h.currentValue)
    }
    return Array.from(totals.entries())
      .map(([sector, currentValue]) => ({
        sector,
        currentValue: Math.round(currentValue * 100) / 100,
      }))
      .sort((a, b) => b.currentValue - a.currentValue)
  }, [holdingsQuery.data])

  const instrumentPnL: InstrumentPnLDatum[] = useMemo(() => {
    const holdings = holdingsQuery.data?.holdings ?? []
    return holdings
      .map((h) => ({
        instrumentSymbol: h.instrumentSymbol || h.instrumentToken,
        pnl: Math.round((h.unrealizedPnL + h.realizedPnL) * 100) / 100,
      }))
      .filter((d) => d.pnl !== 0)
      .sort((a, b) => b.pnl - a.pnl)
  }, [holdingsQuery.data])

  const portfolioValueSeries: PortfolioValueDatum[] = useMemo(() => {
    const snapshots = historyQuery.data ?? []
    return snapshots.map((s) => ({
      date: new Date(s.date).toISOString().slice(0, 10),
      totalValue: s.totalValue ?? 0,
      totalInvested: s.totalInvested ?? 0,
    }))
  }, [historyQuery.data])

  const isLoadingHoldings = holdingsQuery.isLoading
  const isLoadingHistory = historyQuery.isLoading

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Allocation by instrument</CardTitle>
          <CardDescription>Current value share per holding</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHoldings ? (
            <Skeleton className="h-80 w-full" />
          ) : allocationByInstrument.length === 0 ? (
            <EmptyChart>No open holdings to allocate.</EmptyChart>
          ) : (
            <AllocationByInstrumentPie data={allocationByInstrument} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allocation by sector</CardTitle>
          <CardDescription>Current value share per sector</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHoldings ? (
            <Skeleton className="h-80 w-full" />
          ) : allocationBySector.length === 0 ? (
            <EmptyChart>No open holdings to allocate.</EmptyChart>
          ) : (
            <AllocationBySectorPie data={allocationBySector} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio value (90 days)</CardTitle>
          <CardDescription>
            Daily snapshots with invested baseline reference
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <Skeleton className="h-80 w-full" />
          ) : portfolioValueSeries.length === 0 ? (
            <EmptyChart>No daily snapshots yet — runs after market close.</EmptyChart>
          ) : (
            <PortfolioValueArea data={portfolioValueSeries} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>P&L by instrument</CardTitle>
          <CardDescription>Unrealized + realized per holding</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHoldings ? (
            <Skeleton className="h-80 w-full" />
          ) : instrumentPnL.length === 0 ? (
            <EmptyChart>No P&L recorded yet.</EmptyChart>
          ) : (
            <InstrumentPnLBar data={instrumentPnL} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-80 items-center justify-center rounded-md border border-dashed text-sm">
      {children}
    </div>
  )
}
