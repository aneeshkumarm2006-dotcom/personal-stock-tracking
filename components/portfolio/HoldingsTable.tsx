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
    return <Skeleton className="h-64 w-full" />
  }

  if (query.isError) {
    return <p className="text-destructive text-sm">Unable to load holdings.</p>
  }

  const data = query.data
  const openHoldings = (data?.holdings ?? []).filter((h) => !h.isClosed)
  const lastUpdated = data?.oldestFetchedAt ?? null

  if (openHoldings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No open holdings yet. Add a BUY transaction to get started.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border">
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
                    className="hover:underline"
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
      <p className="text-xs text-muted-foreground">
        Last updated: {formatIstTime(lastUpdated)}
      </p>
    </div>
  )
}
