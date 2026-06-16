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
import { EmptyState } from '@/components/ui/empty-state'
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
  WealthHistoryChart,
  type WealthHistoryDatum,
} from '@/components/charts/WealthHistoryChart'
import { sectorForSymbol } from '@/lib/portfolio/sectors'
import type { EnrichedHolding } from '@/lib/portfolio/summary'

type HoldingsResponse = {
  holdings: EnrichedHolding[]
}

type HistorySnapshot = {
  date: string
  cash?: number
  investmentValue?: number
  niftyValue?: number
  fdValue?: number
}

async function fetchHoldings(): Promise<HoldingsResponse> {
  const res = await fetch('/api/holdings', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  return (await res.json()) as HoldingsResponse
}

async function fetchHistory(): Promise<HistorySnapshot[]> {
  const res = await fetch('/api/portfolio/history?days=all', {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as HistorySnapshot[]
  return Array.isArray(data) ? data : []
}

export function PortfolioCharts() {
  const holdingsQuery = useQuery({ queryKey: ['holdings'], queryFn: fetchHoldings })
  const historyQuery = useQuery({
    queryKey: ['portfolio-history', 'all'],
    queryFn: fetchHistory,
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

  const wealthHistorySeries: WealthHistoryDatum[] = useMemo(() => {
    const snapshots = historyQuery.data ?? []
    return snapshots.map((s) => ({
      date: new Date(s.date).toISOString().slice(0, 10),
      cash: s.cash ?? 0,
      investmentValue: s.investmentValue ?? 0,
      niftyValue: s.niftyValue ?? 0,
      fdValue: s.fdValue ?? 0,
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
            <Skeleton className="h-[280px] w-full" />
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
            <Skeleton className="h-[280px] w-full" />
          ) : allocationBySector.length === 0 ? (
            <EmptyChart>No open holdings to allocate.</EmptyChart>
          ) : (
            <AllocationBySectorPie data={allocationBySector} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wealth history</CardTitle>
          <CardDescription>
            Your investments vs Nifty, FD @ 7.5%, and cash
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <Skeleton className="h-[280px] w-full" />
          ) : wealthHistorySeries.length === 0 ? (
            <EmptyChart>No daily snapshots yet — runs after market close.</EmptyChart>
          ) : (
            <WealthHistoryChart data={wealthHistorySeries} />
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
            <Skeleton className="h-[280px] w-full" />
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
    <EmptyState className="h-[280px] min-h-0 py-0" description={children} />
  )
}
