import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRightIcon } from 'lucide-react'

import { getSignal } from '@/lib/scanner/queries'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, SectionHeader } from '@/components/PageHeader'
import { EventLog } from '@/components/scanner/EventLog'
import { ScannerSignalChart } from '@/components/scanner/ScannerSignalChart'
import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const STRATEGY_LABELS: Record<string, string> = {
  breakout: 'Breakout',
  pullback: 'Pullback',
  trend_st_adx: 'Trend ST/ADX',
  rs_momentum: 'RS momentum',
  rsi_mr: 'RSI mean-rev',
}

const EXIT_REASON_LABELS: Record<string, string> = {
  SL: 'Stopped out',
  TP1: 'TP1 hit',
  TP2: 'TP2 hit',
  TRAIL: 'Trailed out',
  TIME: 'Time stop',
  RSI_EXIT: 'RSI exit',
  REBAL_EXIT: 'Rebalanced',
  SLEEVE_EXIT: 'Sleeve exit',
}

// Friendlier labels for the (numeric) snapshot indicators; unknown keys fall
// through to their raw name so future engine additions still render.
const SNAPSHOT_LABELS: Record<string, string> = {
  close: 'Close',
  atr14: 'ATR(14)',
  rsi14: 'RSI(14)',
  adx14: 'ADX(14)',
  vol_mult: 'Vol ×',
  deliv_pct: 'Delivery %',
  bbw_pctile: 'BBW %ile',
  rs_pctile: 'RS %ile',
  st_dir: 'SuperTrend',
}

// Local (per-slice) position-status → Badge styling, kept inline so the scanner
// slices stay decoupled (matches PositionsTable / health conventions).
function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'OPEN':
      return { label: 'Open', className: 'bg-primary/10 text-primary border-transparent' }
    case 'PENDING_ENTRY':
      return {
        label: 'Pending entry',
        className: 'bg-secondary text-secondary-foreground border-transparent',
      }
    case 'CLOSED':
      return { label: 'Closed', className: 'text-muted-foreground' }
    case 'SKIPPED_GAP':
      return { label: 'Skipped gap', className: 'text-muted-foreground' }
    default:
      return { label: status || '—', className: 'text-muted-foreground' }
  }
}

function strategyLabel(strategy: string): string {
  return STRATEGY_LABELS[strategy] ?? strategy
}

// Snapshot / score values are plain numbers (or null). Show up to 2 decimals,
// integers bare, and '—' for missing.
function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function fmtR(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}R`
}

function fmtPct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}%`
}

function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={`text-sm font-medium tabular-nums ${className ?? ''}`}>{value}</dd>
    </div>
  )
}

export default async function ScannerSignalPage({ params }: RouteContext) {
  const { id } = await params
  const { signal, position } = await getSignal(id)

  if (signal == null) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Signal not found"
          description="This scanner signal does not exist or has not been published."
        />
        <EmptyState
          title="Signal not found"
          description="The signal you are looking for could not be found. It may belong to a run that has not published yet."
          action={
            <Link
              href="/scanner/days"
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Browse scan days
            </Link>
          }
        />
      </div>
    )
  }

  const scoreEntries = Object.entries(signal.scoreBreakdown ?? {})
  const snapshotEntries = Object.entries(signal.snapshot ?? {})
  const flags = signal.flags ?? []
  const posBadge = position ? statusBadge(position.status) : null

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title={signal.symbol}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{strategyLabel(signal.strategy)}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="font-mono text-xs">{signal.setup}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>Rank #{signal.rank}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="tabular-nums">{signal.date}</span>
          </span>
        }
        actions={
          <Link
            href={`/scanner/days/${signal.date}`}
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            Back to {signal.date}
          </Link>
        }
      />

      <section className="space-y-3">
        <SectionHeader title="Signal" hint={`Score ${signal.score.toFixed(1)}`} />
        <Card>
          <CardContent className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              <Stat label="Score" value={signal.score.toFixed(1)} />
              <Stat label="Buy" value={formatCurrency(signal.buy)} />
              <Stat label="Stop loss" value={formatCurrency(signal.sl)} />
              <Stat label="TP1" value={formatCurrency(signal.tp1)} />
              <Stat label="TP2" value={formatCurrency(signal.tp2)} />
              <Stat
                label="R:R"
                value={signal.rr != null ? signal.rr.toFixed(2) : '—'}
              />
              <Stat label="Planned qty" value={formatInt(signal.plannedQty)} />
              <Stat label="Risk %" value={fmtPct(signal.riskPct)} />
              <Stat
                label="Validity"
                value={
                  signal.validitySessions != null
                    ? `${signal.validitySessions} sessions`
                    : '—'
                }
              />
            </dl>

            {scoreEntries.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-muted-foreground text-xs">Score breakdown</div>
                <div className="flex flex-wrap gap-1.5">
                  {scoreEntries.map(([key, val]) => (
                    <Badge
                      key={key}
                      variant="outline"
                      className="gap-1 text-xs font-normal"
                    >
                      <span className="text-muted-foreground">{key}</span>
                      <span className="tabular-nums">{fmtNum(val)}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {flags.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-muted-foreground text-xs">Flags</div>
                <div className="flex flex-wrap gap-1.5">
                  {flags.map((f, i) => (
                    <Badge
                      key={`flag-${i}`}
                      variant="outline"
                      className="text-muted-foreground text-xs"
                    >
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {snapshotEntries.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-muted-foreground text-xs">Snapshot</div>
                <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
                  {snapshotEntries.map(([key, val]) => (
                    <div key={key}>
                      <dt className="text-muted-foreground text-xs">
                        {SNAPSHOT_LABELS[key] ?? key}
                      </dt>
                      <dd className="text-sm font-medium tabular-nums">{fmtNum(val)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Price & levels" hint={`${signal.symbol} · daily`} />
        <Card>
          <CardContent>
            <ScannerSignalChart
              signalId={signal.id}
              symbol={signal.symbol}
              buy={signal.buy ?? null}
              sl={signal.sl ?? null}
              tp1={signal.tp1 ?? null}
              tp2={signal.tp2 ?? null}
              entryDate={position?.entryDate ?? null}
              entryPrice={position?.entryPrice ?? null}
              exitDate={position?.exitDate ?? null}
              exitPrice={position?.exitPrice ?? null}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Position"
          hint={posBadge ? posBadge.label : 'Not tracked'}
        />
        {position && posBadge ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>Position</span>
                <Badge variant="outline" className={posBadge.className}>
                  {posBadge.label}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <Stat label="Entry date" value={position.entryDate ?? '—'} />
                <Stat label="Entry price" value={formatCurrency(position.entryPrice)} />
                <Stat
                  label="Qty"
                  value={position.qty != null ? formatInt(position.qty) : '—'}
                />
                <Stat
                  label="Days held"
                  value={position.daysHeld != null ? formatInt(position.daysHeld) : '—'}
                />
                <Stat label="Exit date" value={position.exitDate ?? '—'} />
                <Stat label="Exit price" value={formatCurrency(position.exitPrice)} />
                <Stat
                  label="Exit reason"
                  value={
                    position.exitReason
                      ? (EXIT_REASON_LABELS[position.exitReason] ?? position.exitReason)
                      : '—'
                  }
                />
                <Stat
                  label="R multiple"
                  value={fmtR(position.rMultiple)}
                  className={pnlColorClass(position.rMultiple)}
                />
                <Stat
                  label="Gross P&L"
                  value={formatCurrency(position.grossPnl)}
                  className={pnlColorClass(position.grossPnl)}
                />
                <Stat
                  label="Costs"
                  value={position.costs != null ? formatCurrency(position.costs) : '—'}
                />
                <Stat
                  label="Net P&L"
                  value={formatCurrency(position.netPnl)}
                  className={pnlColorClass(position.netPnl)}
                />
                <Stat
                  label="MFE / MAE"
                  value={
                    <span>
                      <span className="text-gain">{fmtPct(position.mfe)}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-loss">{fmtPct(position.mae)}</span>
                    </span>
                  }
                />
              </dl>
              {position.lastMark ? (
                <div className="text-muted-foreground text-xs">
                  Last mark {position.lastMark.date}: close{' '}
                  {formatCurrency(position.lastMark.close)} · unrealized{' '}
                  <span className={pnlColorClass(position.lastMark.unrealizedPnl)}>
                    {formatCurrency(position.lastMark.unrealizedPnl)}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            title="No position tracked"
            description="The paper engine has not created a position record for this signal yet."
          />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Event log"
          hint={`${position?.events?.length ?? 0} events`}
        />
        <Card>
          <CardContent>
            <EventLog events={position?.events ?? []} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Raw document" />
        <details className="group overflow-hidden rounded-lg border">
          <summary className="hover:bg-muted/50 flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5 text-sm transition-colors select-none [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon
              className="text-muted-foreground size-3.5 shrink-0 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            <span className="font-medium">Signal document (JSON)</span>
            <span className="text-muted-foreground text-xs">
              the raw handoff queue-card isn&apos;t stored in Mongo — this is the
              persisted signal document
            </span>
          </summary>
          <div className="border-t">
            <pre className="thin-scrollbar overflow-x-auto px-3 py-3 text-xs leading-relaxed">
              {JSON.stringify(signal, null, 2)}
            </pre>
          </div>
        </details>
      </section>
    </div>
  )
}
