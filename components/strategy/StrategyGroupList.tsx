'use client'

import { useMemo, useRef, useState } from 'react'
import { CalendarClockIcon, LayersIcon, SearchIcon } from 'lucide-react'
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
import {
  formatCurrency,
  formatInt,
  formatIstDate,
  formatIstDateTime,
  istDayKey,
} from '@/lib/format'
import type { EntryStats, GroupStats } from '@/lib/strategy/group'
import type { StrategyEntryStatus } from '@/lib/strategy/evaluate'
import { GroupCard } from './GroupCard'
import { statusDisplay } from './EntriesTable'
import { StrategyLivePrices } from './StrategyLivePrices'

// Stocks that are live or still waiting to fill — the open positions worth
// spotting across groups. Settled entries (TP/SL/closed/expired) are excluded.
const OPEN_STATUSES = new Set<StrategyEntryStatus>([
  'pending',
  'active',
  'partial',
  'trailing',
])

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

// An entry for one stock, tagged with the group it belongs to.
type CommonOccurrence = { groupName: string; entry: EntryStats }
type CommonStock = { symbol: string; occurrences: CommonOccurrence[] }

export function StrategyGroupList({ groups }: StrategyGroupListProps) {
  const [search, setSearch] = useState('')
  const [showCommon, setShowCommon] = useState(false)
  // The date panel and which IST calendar day it's filtered to. Defaults to
  // today; the button lets you retarget it to any day via a calendar picker.
  const [showDate, setShowDate] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string>(() => istDayKey(new Date()))

  // The hidden native date input, opened on a double-click of the day button,
  // plus a debounce timer that lets us tell a single click from a double one.
  const dateInputRef = useRef<HTMLInputElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  }, [groups, search])

  // Both cross-group panels need every group's entries loaded.
  const needDetails = showCommon || showDate

  // Fetch every active group's detail so we can spot stocks across groups.
  // Same query keys as GroupCard, so the cache is shared. Only fires once a
  // cross-group view (Common stocks / day panel) is opened.
  const detailQueries = useQueries({
    queries: groups.map((g) => ({
      queryKey: ['strategyGroup', g._id],
      queryFn: () => fetchGroupDetail(g._id),
      enabled: needDetails,
      refetchInterval: 30_000,
    })),
  })

  const detailsLoading = needDetails && detailQueries.some((q) => q.isLoading)

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
        if (!OPEN_STATUSES.has(entry.status)) continue
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
    const entryTime = (o: CommonOccurrence | undefined) =>
      o?.entry.createdAt ? new Date(o.entry.createdAt).getTime() : 0
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

  // Every entry created on the selected IST day, across all groups, newest
  // first. The day is the stock's create day, matching the "Entry date" shown
  // in the tables.
  const dayEntries = useMemo<CommonOccurrence[]>(() => {
    if (!showDate) return []
    const q = search.trim().toLowerCase()
    const rows: CommonOccurrence[] = []
    detailQueries.forEach((query, i) => {
      const entries = query.data?.stats.entries
      if (!entries) return
      const groupName = groups[i]?.name ?? 'Unknown group'
      for (const entry of entries) {
        if (istDayKey(entry.createdAt) !== selectedDay) continue
        if (q) {
          const symbol = (entry.instrumentSymbol || entry.instrumentToken).toLowerCase()
          if (!symbol.includes(q)) continue
        }
        rows.push({ groupName, entry })
      }
    })
    const entryTime = (o: CommonOccurrence) =>
      o.entry.createdAt ? new Date(o.entry.createdAt).getTime() : 0
    return rows.sort((a, b) => entryTime(b) - entryTime(a))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDate, search, groups, detailDataKey, selectedDay])

  // Both filters on: the intersection. Take the selected day's entries and keep
  // only symbols entered in 2+ distinct groups *that day* — a stock is "common"
  // here only if the day's own entries span multiple groups, not because it
  // happens to be open in another group from an earlier day. Grouped by symbol
  // like the Common stocks panel, so every shown symbol has 2+ rows.
  const combinedStocks = useMemo<CommonStock[]>(() => {
    if (!showDate || !showCommon) return []
    const bySymbol = new Map<string, CommonOccurrence[]>()
    for (const o of dayEntries) {
      const symbol = o.entry.instrumentSymbol || o.entry.instrumentToken
      if (!symbol) continue
      const list = bySymbol.get(symbol) ?? []
      list.push(o)
      bySymbol.set(symbol, list)
    }
    const entryTime = (o: CommonOccurrence | undefined) =>
      o?.entry.createdAt ? new Date(o.entry.createdAt).getTime() : 0
    return Array.from(bySymbol.entries())
      .map(([symbol, occurrences]) => ({
        symbol,
        occurrences: [...occurrences].sort((a, b) => entryTime(b) - entryTime(a)),
      }))
      // Common = entered in two or more distinct groups on the selected day.
      .filter((s) => new Set(s.occurrences.map((o) => o.groupName)).size >= 2)
      .sort((a, b) => entryTime(b.occurrences[0]) - entryTime(a.occurrences[0]))
  }, [showDate, showCommon, dayEntries])

  const showCombined = showDate && showCommon
  const combinedCount = combinedStocks.reduce(
    (n, s) => n + s.occurrences.length,
    0,
  )

  // Copy helpers shared by the day button, panels, and search box. `dayNoun`
  // slots into sentences ("added … today" / "added … on 5 Jul 2026").
  const todayKey = istDayKey(new Date())
  const isToday = selectedDay === todayKey
  const dayNoun = isToday ? 'today' : `on ${formatIstDate(selectedDay)}`
  const searchLabel = showCombined
    ? isToday
      ? 'Search today’s common stocks'
      : `Search common stocks ${dayNoun}`
    : showDate
      ? isToday
        ? 'Search today’s entries'
        : `Search entries ${dayNoun}`
      : showCommon
        ? 'Search common stocks'
        : 'Search groups by name'

  // Single click selects today (toggling the panel off if it's already on
  // today); a double click opens the calendar instead. A short timer holds the
  // single-click action so a double click can cancel it.
  const handleDayClick = () => {
    if (clickTimerRef.current) return
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      const today = istDayKey(new Date())
      if (showDate && selectedDay === today) {
        setShowDate(false)
      } else {
        setSelectedDay(today)
        setShowDate(true)
      }
    }, 220)
  }

  const handleDayDoubleClick = () => {
    // Cancel the pending single-click action so it doesn't also fire.
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    const input = dateInputRef.current
    if (!input) return
    // showPicker() is the modern way to pop the native calendar, but it can
    // throw (or be missing) in some browsers — fall back to focus + click.
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        // fall through to the focus/click fallback
      }
    }
    input.focus()
    input.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StrategyLivePrices />
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* The search box sifts groups, common stocks, or the day's entries —
              whichever view is active. Hidden for a single ungrouped list. */}
          {(groups.length > 1 || showDate) && (
            <div className="relative w-full sm:w-64">
              <SearchIcon
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchLabel}
                className="pl-8"
                aria-label={searchLabel}
              />
            </div>
          )}
          {/* Click for today, double-click to pick any date. The native date
              input is hidden but anchored to this button for the picker. */}
          <div className="relative">
            <Button
              variant={showDate ? 'default' : 'outline'}
              aria-pressed={showDate}
              title="Click for today, double-click to pick a date"
              onClick={handleDayClick}
              onDoubleClick={handleDayDoubleClick}
            >
              <CalendarClockIcon className="size-4" />
              {isToday ? 'Today' : formatIstDate(selectedDay)}
            </Button>
            <input
              ref={dateInputRef}
              type="date"
              value={selectedDay}
              max={todayKey}
              tabIndex={-1}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-0 opacity-0"
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDay(e.target.value)
                  setShowDate(true)
                }
              }}
            />
          </div>
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

      {showCombined ? (
        <CommonStocksPanel
          loading={detailsLoading}
          stocks={combinedStocks}
          title={isToday ? 'Today’s common stocks' : `Common stocks ${dayNoun}`}
          description={`Stocks you added to two or more groups ${dayNoun} (${combinedCount}).`}
          emptyDescription={`No stocks were added to multiple groups ${dayNoun} yet.`}
        />
      ) : showDate ? (
        <DayEntriesPanel
          loading={detailsLoading}
          rows={dayEntries}
          isToday={isToday}
          dayNoun={dayNoun}
          selectedDay={selectedDay}
        />
      ) : showCommon ? (
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

function DayEntriesPanel({
  loading,
  rows,
  isToday,
  dayNoun,
  selectedDay,
}: {
  loading: boolean
  rows: CommonOccurrence[]
  isToday: boolean
  dayNoun: string
  selectedDay: string
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

  if (rows.length === 0) {
    return (
      <EmptyState
        className="min-h-24 py-6"
        description={`No entries created ${dayNoun} yet.`}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isToday ? 'Today’s entries' : `Entries on ${formatIstDate(selectedDay)}`}
        </CardTitle>
        <CardDescription>
          Stocks you added to any group {dayNoun} ({rows.length}).
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
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o, idx) => {
                const e = o.entry
                const symbol = e.instrumentSymbol || e.instrumentToken || '—'
                const status = statusDisplay(e)
                return (
                  <TableRow key={`${symbol}-${o.groupName}-${e.id ?? idx}`}>
                    <TableCell className="font-medium">{symbol}</TableCell>
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
                      <Badge variant={status.variant} className={status.className}>
                        {status.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function CommonStocksPanel({
  loading,
  stocks,
  title = 'Common stocks',
  description = 'Stocks that are live or still waiting to fill in two or more groups.',
  emptyDescription = 'No open stocks are shared across multiple groups yet.',
}: {
  loading: boolean
  stocks: CommonStock[]
  title?: string
  description?: string
  emptyDescription?: string
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
      <EmptyState className="min-h-24 py-6" description={emptyDescription} />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.flatMap((stock) =>
                stock.occurrences.map((o, idx) => {
                  const e = o.entry
                  const key = `${stock.symbol}-${o.groupName}-${e.id ?? idx}`
                  const status = statusDisplay(e)
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
                        <Badge variant={status.variant} className={status.className}>
                          {status.label}
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
