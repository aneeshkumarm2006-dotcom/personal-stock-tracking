'use client'

import { useMemo, useState } from 'react'
import { LayersIcon, SearchIcon } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatInt, formatIstDateTime } from '@/lib/format'
import type { EntryStats, GroupStats } from '@/lib/strategy/group'
import { GroupCard } from './GroupCard'
import { StrategyLivePrices } from './StrategyLivePrices'

type GroupDoc = {
  _id: string
  name: string
  allocatedCapital: number
  status: 'active' | 'closed'
  createdAt?: string
  closedAt?: string
}

type GroupDetailResponse = {
  group: GroupDoc
  entries: unknown[]
  stats: GroupStats
}

export type StrategyGroupListProps = {
  groups: GroupDoc[]
}

async function fetchGroupDetail(id: string): Promise<GroupDetailResponse> {
  const res = await fetch(`/api/strategy/groups/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to load group (${res.status})`)
  return (await res.json()) as GroupDetailResponse
}

// A pending entry for one stock, tagged with the group it belongs to.
type CommonOccurrence = { groupName: string; entry: EntryStats }
type CommonStock = { symbol: string; occurrences: CommonOccurrence[] }

export function StrategyGroupList({ groups }: StrategyGroupListProps) {
  const [search, setSearch] = useState('')
  const [showCommon, setShowCommon] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  }, [groups, search])

  // Fetch every active group's detail so we can spot stocks waiting in more
  // than one group. Same query keys as GroupCard, so the cache is shared.
  // Only fires once the Common stocks view is opened.
  const detailQueries = useQueries({
    queries: groups.map((g) => ({
      queryKey: ['strategyGroup', g._id],
      queryFn: () => fetchGroupDetail(g._id),
      enabled: showCommon,
      refetchInterval: 30_000,
    })),
  })

  const detailsLoading = showCommon && detailQueries.some((q) => q.isLoading)

  // A stable key over the fetched detail data, so the memo below re-runs when
  // the data changes (not merely when the query array's identity does).
  const detailDataKey = detailQueries.map((q) => q.data).join(',')

  // Group pending entries by symbol, then keep only the symbols that are
  // waiting in 2+ distinct groups — those are the "common" stocks.
  const commonStocks = useMemo<CommonStock[]>(() => {
    if (!showCommon) return []
    const bySymbol = new Map<string, CommonOccurrence[]>()
    detailQueries.forEach((q, i) => {
      const entries = q.data?.stats.entries
      if (!entries) return
      const groupName = groups[i]?.name ?? 'Unknown group'
      for (const entry of entries) {
        if (entry.status !== 'pending') continue
        // Unassigned entries have no stock to match across groups — skip them so
        // they don't all cluster under an empty symbol.
        if (!entry.instrumentToken && !entry.instrumentSymbol) continue
        const symbol = entry.instrumentSymbol || entry.instrumentToken
        const list = bySymbol.get(symbol) ?? []
        list.push({ groupName, entry })
        bySymbol.set(symbol, list)
      }
    })

    const q = search.trim().toLowerCase()
    const entryTime = (o: CommonOccurrence) =>
      o.entry.createdAt ? new Date(o.entry.createdAt).getTime() : 0
    return Array.from(bySymbol.entries())
      .map(([symbol, occurrences]) => ({
        symbol,
        // Newest entry first within a symbol's rows.
        occurrences: [...occurrences].sort((a, b) => entryTime(b) - entryTime(a)),
      }))
      .filter(
        (s) => new Set(s.occurrences.map((o) => o.groupName)).size >= 2,
      )
      .filter((s) => !q || s.symbol.toLowerCase().includes(q))
      // Most recently entered stock at the top; its newest occurrence ranks it.
      .sort((a, b) => entryTime(b.occurrences[0]) - entryTime(a.occurrences[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCommon, search, groups, detailDataKey])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StrategyLivePrices />
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Only worth a filter once there's more than one group to sift. */}
          {groups.length > 1 && (
            <div className="relative w-full sm:w-64">
              <SearchIcon
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  showCommon ? 'Search common stocks' : 'Search groups by name'
                }
                className="pl-8"
                aria-label={
                  showCommon ? 'Search common stocks' : 'Search groups by name'
                }
              />
            </div>
          )}
          {groups.length > 1 && (
            <Button
              variant={showCommon ? 'default' : 'outline'}
              aria-pressed={showCommon}
              onClick={() => setShowCommon((v) => !v)}
            >
              <LayersIcon className="size-4" />
              Common stocks
            </Button>
          )}
        </div>
      </div>

      {showCommon ? (
        <CommonStocksPanel loading={detailsLoading} stocks={commonStocks} />
      ) : filtered.length === 0 ? (
        <EmptyState
          className="min-h-24 py-6"
          description={`No groups match “${search.trim()}”.`}
        />
      ) : (
        filtered.map((group) => (
          <GroupCard key={group._id} groupId={group._id} initialGroup={group} />
        ))
      )}
    </div>
  )
}

function CommonStocksPanel({
  loading,
  stocks,
}: {
  loading: boolean
  stocks: CommonStock[]
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (stocks.length === 0) {
    return (
      <EmptyState
        className="min-h-24 py-6"
        description="No waiting stocks are shared across multiple groups yet."
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Common stocks</CardTitle>
        <CardDescription>
          Stocks still waiting to fill (pending) in two or more groups.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Entry date</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">SL</TableHead>
                <TableHead className="text-right">TP1</TableHead>
                <TableHead className="text-right">TP2</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Waiting for</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.flatMap((stock) =>
                stock.occurrences.map((o, idx) => {
                  const e = o.entry
                  const key = `${stock.symbol}-${o.groupName}-${e.id ?? idx}`
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">
                        {/* Only label the symbol once per group of rows. */}
                        {idx === 0 ? stock.symbol : ''}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.groupName}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatIstDateTime(e.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(e.entryPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {e.currentPrice !== null
                          ? formatCurrency(e.currentPrice)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(e.stopLoss)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(e.targetPrice)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right">
                        {e.target2 !== null ? formatCurrency(e.target2) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatInt(e.quantity)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {e.triggerType === 'stop'
                            ? 'Breakout ↑'
                            : 'Dip ↓'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                }),
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
