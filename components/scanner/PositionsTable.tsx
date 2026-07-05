'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { DownloadIcon, SearchIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'
import type { ScannerPosition } from '@/lib/scanner/types'

export type PositionsTableProps = {
  positions: ScannerPosition[]
}

type StatusFilter = 'all' | 'open' | 'closed'

// "open" groups the still-live states; "closed" groups the settled ones.
const OPEN_STATUSES = new Set(['OPEN', 'PENDING_ENTRY'])
const CLOSED_STATUSES = new Set(['CLOSED', 'SKIPPED_GAP'])

const STATUS_ITEMS: Record<StatusFilter, string> = {
  all: 'All statuses',
  open: 'Open / pending',
  closed: 'Closed',
}

const STRATEGY_LABELS: Record<string, string> = {
  breakout: 'Breakout',
  pullback: 'Pullback',
  trend_st_adx: 'Trend ST/ADX',
  rs_momentum: 'RS momentum',
  rsi_mr: 'RSI mean-rev',
}

// Local (per-slice) status → Badge styling. Kept inline rather than shared so
// parallel scanner slices stay decoupled.
function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'OPEN':
      return { label: 'Open', className: 'bg-primary/10 text-primary border-transparent' }
    case 'PENDING_ENTRY':
      return {
        label: 'Pending',
        className: 'bg-secondary text-secondary-foreground border-transparent',
      }
    case 'CLOSED':
      return { label: 'Closed', className: 'text-muted-foreground' }
    case 'SKIPPED_GAP':
      return {
        label: 'Skipped gap',
        className: 'text-muted-foreground',
      }
    default:
      return { label: status || '—', className: 'text-muted-foreground' }
  }
}

function strategyLabel(strategy: string): string {
  return STRATEGY_LABELS[strategy] ?? strategy
}

// R-multiple / excursion percents render as plain fixed-decimal strings ('—' for
// null) — these are already whole-number percents, not fractions.
function fmtR(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}R`
}

function fmtPct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}%`
}

// CSV cell: quote when the value contains a comma, quote, or newline.
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_HEADER = [
  'Symbol',
  'Strategy',
  'Status',
  'Signal Date',
  'Entry Date',
  'Entry Price',
  'Qty',
  'Exit Date',
  'Exit Reason',
  'Days Held',
  'Net P&L',
  'R Multiple',
  'MFE %',
  'MAE %',
]

function buildCsv(rows: ScannerPosition[]): string {
  const lines = [CSV_HEADER.join(',')]
  for (const p of rows) {
    lines.push(
      [
        p.symbol,
        p.strategy,
        p.status,
        p.signalDate,
        p.entryDate,
        p.entryPrice,
        p.qty,
        p.exitDate,
        p.exitReason,
        p.daysHeld,
        p.netPnl,
        p.rMultiple,
        p.mfe,
        p.mae,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n')
}

function downloadCsv(rows: ScannerPosition[]) {
  const csv = buildCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `scanner-positions-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function PositionsTable({ positions }: PositionsTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [strategyFilter, setStrategyFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Strategies actually present in the data drive the dropdown options.
  const strategyOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of positions) {
      if (p.strategy) set.add(p.strategy)
    }
    return [...set].sort()
  }, [positions])

  const strategyItems = useMemo(() => {
    const rec: Record<string, string> = { all: 'All strategies' }
    for (const s of strategyOptions) rec[s] = strategyLabel(s)
    return rec
  }, [strategyOptions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return positions.filter((p) => {
      if (statusFilter === 'open' && !OPEN_STATUSES.has(p.status)) return false
      if (statusFilter === 'closed' && !CLOSED_STATUSES.has(p.status)) return false
      if (strategyFilter !== 'all' && p.strategy !== strategyFilter) return false
      if (q) {
        const haystack = [p.symbol, p.signalDate, p.entryDate, p.exitDate]
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [positions, statusFilter, strategyFilter, search])

  if (positions.length === 0) {
    return (
      <EmptyState
        title="No positions yet"
        description="Positions appear here once the scanner has generated signals and the paper engine starts tracking entries."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-card flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <Select
          items={STATUS_ITEMS}
          value={statusFilter}
          onValueChange={(v) => setStatusFilter((v as StatusFilter) ?? 'all')}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open / pending</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          items={strategyItems}
          value={strategyFilter}
          onValueChange={(v) => setStrategyFilter(v ?? 'all')}
        >
          <SelectTrigger size="sm" className="w-44" aria-label="Strategy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All strategies</SelectItem>
            {strategyOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {strategyLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-40 flex-1 sm:max-w-xs">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or date"
            className="pl-8"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => downloadCsv(filtered)}
          disabled={filtered.length === 0}
        >
          <DownloadIcon />
          Export CSV
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          className="min-h-24 py-6"
          description="No positions match the current filters."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table containerClassName="thin-scrollbar">
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signal date</TableHead>
                <TableHead>Entry date</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Exit</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Net P&amp;L</TableHead>
                <TableHead className="text-right">R</TableHead>
                <TableHead className="text-right">MFE / MAE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const badge = statusBadge(p.status)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/scanner/signals/${encodeURIComponent(p.id)}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {p.symbol || p.token || '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {strategyLabel(p.strategy)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.signalDate || '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.entryDate ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(p.entryPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.qty !== null && p.qty !== undefined ? formatInt(p.qty) : '—'}
                    </TableCell>
                    <TableCell>
                      {p.exitDate || p.exitReason ? (
                        <div className="leading-tight">
                          <span className="tabular-nums">{p.exitDate ?? '—'}</span>
                          {p.exitReason && (
                            <div className="text-muted-foreground text-[10px]">
                              {p.exitReason}
                            </div>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.daysHeld !== null && p.daysHeld !== undefined
                        ? formatInt(p.daysHeld)
                        : '—'}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${pnlColorClass(p.netPnl)}`}>
                      {p.netPnl !== null && p.netPnl !== undefined
                        ? formatCurrency(p.netPnl)
                        : '—'}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${pnlColorClass(p.rMultiple)}`}>
                      {fmtR(p.rMultiple)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="text-gain">{fmtPct(p.mfe)}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-loss">{fmtPct(p.mae)}</span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-muted-foreground text-right text-xs">
        Showing {filtered.length} of {positions.length}
      </p>
    </div>
  )
}
