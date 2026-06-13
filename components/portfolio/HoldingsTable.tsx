'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatInt, formatIstTime, formatPercent, pnlColorClass } from '@/lib/format'
import type { EnrichedHolding } from '@/lib/portfolio/summary'

type HoldingsResponse = {
  holdings: EnrichedHolding[]
  oldestFetchedAt: string | null
}

async function fetchHoldings(): Promise<HoldingsResponse> {
  const res = await fetch('/api/holdings', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to load holdings (${res.status})`)
  return (await res.json()) as HoldingsResponse
}

export type HoldingsTableProps = {
  initialData?: HoldingsResponse
}

export function HoldingsTable({ initialData }: HoldingsTableProps) {
  const query = useQuery({
    queryKey: ['holdings'],
    queryFn: fetchHoldings,
    initialData,
  })

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />
  }

  if (query.isError) {
    return <ErrorState message="Unable to load holdings." />
  }

  const data = query.data
  const openHoldings = (data?.holdings ?? []).filter((h) => !h.isClosed)
  const lastUpdated = data?.oldestFetchedAt ?? null

  if (openHoldings.length === 0) {
    return (
      <EmptyState
        title="No open holdings"
        description="Add a BUY transaction to get started."
      />
    )
  }

  return (
    <div className="space-y-2">
      <div className="bg-card overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Avg Buy Price</TableHead>
              <TableHead className="text-right">Invested</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Current Value</TableHead>
              <TableHead className="text-right">Unrealized P&L</TableHead>
              <TableHead className="text-right">Unrealized %</TableHead>
              <TableHead className="text-right">Day %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {openHoldings.map((h) => (
              <TableRow key={h.instrumentToken}>
                <TableCell className="font-medium">
                  <Link
                    href={`/portfolio/${encodeURIComponent(h.instrumentToken)}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {h.instrumentSymbol || h.instrumentToken}
                  </Link>
                </TableCell>
                <TableCell className="text-right">{formatInt(h.netQty)}</TableCell>
                <TableCell className="text-right">{formatCurrency(h.avgBuyPrice)}</TableCell>
                <TableCell className="text-right">{formatCurrency(h.totalInvested)}</TableCell>
                <TableCell className="text-right">{formatCurrency(h.currentPrice)}</TableCell>
                <TableCell className="text-right">{formatCurrency(h.currentValue)}</TableCell>
                <TableCell className={`text-right ${pnlColorClass(h.unrealizedPnL)}`}>
                  {formatCurrency(h.unrealizedPnL)}
                </TableCell>
                <TableCell className={`text-right ${pnlColorClass(h.unrealizedPnLPct)}`}>
                  {formatPercent(h.unrealizedPnLPct)}
                </TableCell>
                <TableCell className={`text-right ${pnlColorClass(h.dayChangePct)}`}>
                  {formatPercent(h.dayChangePct)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground text-right text-xs">
        Last updated {formatIstTime(lastUpdated)}
      </p>
    </div>
  )
}
