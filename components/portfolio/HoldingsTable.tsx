'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
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
import { formatIstTime, pnlColorClass } from '@/lib/format'
import type { EnrichedHolding } from '@/lib/portfolio/summary'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { HoldingTagsEditor } from './HoldingTagsEditor'

type HoldingWithTags = EnrichedHolding & { tags?: string[] }

type HoldingsResponse = {
  holdings: HoldingWithTags[]
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

type SortKey =
  | 'instrumentSymbol'
  | 'netQty'
  | 'avgBuyPrice'
  | 'totalInvested'
  | 'currentPrice'
  | 'currentValue'
  | 'unrealizedPnL'
  | 'unrealizedPnLPct'
  | 'dayChangePct'

type SortDir = 'asc' | 'desc'

// `key: null` columns are not sortable (e.g. Tags). `right` columns are numeric.
const COLUMNS: { label: string; key: SortKey | null; align?: 'right' }[] = [
  { label: 'Symbol', key: 'instrumentSymbol' },
  { label: 'Tags', key: null },
  { label: 'Qty', key: 'netQty', align: 'right' },
  { label: 'Avg Buy Price', key: 'avgBuyPrice', align: 'right' },
  { label: 'Invested', key: 'totalInvested', align: 'right' },
  { label: 'Current Price', key: 'currentPrice', align: 'right' },
  { label: 'Current Value', key: 'currentValue', align: 'right' },
  { label: 'Unrealized P&L', key: 'unrealizedPnL', align: 'right' },
  { label: 'Unrealized %', key: 'unrealizedPnLPct', align: 'right' },
  { label: 'Day %', key: 'dayChangePct', align: 'right' },
]

// Sorts by the chosen column, always pushing null/missing values to the end
// regardless of direction.
function compareHoldings(a: HoldingWithTags, b: HoldingWithTags, key: SortKey, dir: SortDir): number {
  const av = a[key]
  const bv = b[key]
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  const sign = dir === 'asc' ? 1 : -1
  if (typeof av === 'string' && typeof bv === 'string') {
    return av.localeCompare(bv) * sign
  }
  return ((av as number) - (bv as number)) * sign
}

export function HoldingsTable({ initialData }: HoldingsTableProps) {
  const query = useQuery({
    queryKey: ['holdings'],
    queryFn: fetchHoldings,
    initialData,
  })
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const openHoldings = useMemo(() => {
    const open = (query.data?.holdings ?? []).filter((h) => !h.isClosed)
    if (!sortKey) return open
    return [...open].sort((a, b) => compareHoldings(a, b, sortKey, sortDir))
  }, [query.data, sortKey, sortDir])

  // First click on a column sorts ascending; clicking the active column again
  // toggles to descending and back.
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />
  }

  if (query.isError) {
    return <ErrorState message="Unable to load holdings." />
  }

  const lastUpdated = query.data?.oldestFetchedAt ?? null

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
              {COLUMNS.map(({ label, key, align }) => (
                <TableHead
                  key={label}
                  className={[
                    align === 'right' ? 'text-right' : '',
                    key ? 'cursor-pointer select-none' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={key ? () => handleSort(key) : undefined}
                >
                  {label}
                </TableHead>
              ))}
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
                <TableCell>
                  <HoldingTagsEditor
                    instrumentToken={h.instrumentToken}
                    instrumentSymbol={h.instrumentSymbol || h.instrumentToken}
                    tags={h.tags ?? []}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <AnimatedNumber value={h.netQty} format="int" />
                </TableCell>
                <TableCell className="text-right">
                  <AnimatedNumber value={h.avgBuyPrice} format="currency" />
                </TableCell>
                <TableCell className="text-right">
                  <AnimatedNumber value={h.totalInvested} format="currency" />
                </TableCell>
                <TableCell className="text-right">
                  <AnimatedNumber value={h.currentPrice} format="currency" />
                </TableCell>
                <TableCell className="text-right">
                  <AnimatedNumber value={h.currentValue} format="currency" />
                </TableCell>
                <TableCell className={`text-right ${pnlColorClass(h.unrealizedPnL)}`}>
                  <AnimatedNumber value={h.unrealizedPnL} format="currency" />
                </TableCell>
                <TableCell className={`text-right ${pnlColorClass(h.unrealizedPnLPct)}`}>
                  <AnimatedNumber value={h.unrealizedPnLPct} format="percent" />
                </TableCell>
                <TableCell className={`text-right ${pnlColorClass(h.dayChangePct)}`}>
                  <AnimatedNumber value={h.dayChangePct} format="percent" />
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
