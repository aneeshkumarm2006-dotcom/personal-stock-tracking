import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRightIcon } from 'lucide-react'

import { getPatternSignal } from '@/lib/scanner/queries'
import {
  patternLabel,
  tierLabel,
  tierTone,
  qualityComponentLabel,
} from '@/lib/scanner/patternMeta'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, SectionHeader } from '@/components/PageHeader'
import { EventLog } from '@/components/scanner/EventLog'
import { ScannerSignalChart } from '@/components/scanner/ScannerSignalChart'
import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const EXIT_REASON_LABELS: Record<string, string> = {
  SL: 'Stopped out',
  TP1: 'TP1 hit',
  TP2: 'TP2 hit',
  TRAIL: 'Trailed out',
  TIME: 'Time stop',
}

function positionStatusBadge(status: string): { label: string; className: string } {
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

export default async function PatternSignalPage({ params }: RouteContext) {
  const { id } = await params
  const { detection, position } = await getPatternSignal(id)

  if (detection == null) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Detection not found"
          description="This chart-pattern detection does not exist or has not been published."
        />
        <EmptyState
          title="Detection not found"
          description="The detection you are looking for could not be found. It may belong to a run that has not published yet."
          action={
            <Link
              href="/scanner"
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Back to the scanner
            </Link>
          }
        />
      </div>
    )
  }

  const tl = tierLabel(detection.tier)
  const componentEntries = Object.entries(detection.qualityComponents ?? {})
  const flags = detection.flags ?? []
  const posBadge = position ? positionStatusBadge(position.status) : null

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title={detection.symbol}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{patternLabel(detection.strategy)}</span>
            {tl ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  tierTone(detection.tier),
                )}
              >
                {tl}
              </span>
            ) : null}
            <span className="text-muted-foreground/50">·</span>
            <span className="tabular-nums">{detection.date}</span>
            {!detection.tradable ? (
              <>
                <span className="text-muted-foreground/50">·</span>
                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                  untradable · {detection.series}
                </Badge>
              </>
            ) : null}
          </span>
        }
        actions={
          <Link
            href={`/scanner/patterns/days/${detection.date}`}
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            All detections on {detection.date}
          </Link>
        }
      />

      <section className="space-y-3">
        <SectionHeader title="Detection" hint={`Quality ${detection.quality}`} />
        <Card>
          <CardContent className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              <Stat label="Quality" value={detection.quality} />
              <Stat label="Buy" value={formatCurrency(detection.buy)} />
              <Stat label="Stop loss" value={formatCurrency(detection.sl)} />
              <Stat label="TP1" value={formatCurrency(detection.tp1)} />
              <Stat label="TP2" value={formatCurrency(detection.tp2)} />
              <Stat
                label="R:R"
                value={detection.rr != null ? detection.rr.toFixed(2) : '—'}
              />
              <Stat label="Planned qty" value={formatInt(detection.plannedQty)} />
              <Stat label="Risk %" value={fmtPct(detection.riskPct)} />
              <Stat
                label="Validity"
                value={
                  detection.validitySessions != null
                    ? `${detection.validitySessions} sessions`
                    : '—'
                }
              />
              <Stat
                label="Measured move"
                value={
                  detection.measuredMove != null
                    ? formatCurrency(detection.measuredMove)
                    : '—'
                }
              />
              <Stat label="Confirm bar" value={detection.confirmDate ?? '—'} />
              <Stat
                label="Cohort"
                value={detection.tradable ? 'Tradable' : `Untradable · ${detection.series}`}
              />
            </dl>

            {componentEntries.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-muted-foreground text-xs">Quality breakdown</div>
                <div className="flex flex-wrap gap-1.5">
                  {componentEntries.map(([key, val]) => (
                    <Badge key={key} variant="outline" className="gap-1 text-xs font-normal">
                      <span className="text-muted-foreground">
                        {qualityComponentLabel(key)}
                      </span>
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
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Price & pattern geometry"
          hint={`${detection.symbol} · daily`}
        />
        <Card>
          <CardContent>
            <ScannerSignalChart
              signalId={detection.id}
              symbol={detection.symbol}
              buy={detection.buy ?? null}
              sl={detection.sl ?? null}
              tp1={detection.tp1 ?? null}
              tp2={detection.tp2 ?? null}
              entryDate={position?.entryDate ?? null}
              entryPrice={position?.entryPrice ?? null}
              exitDate={position?.exitDate ?? null}
              exitPrice={position?.exitPrice ?? null}
              patternGeometry={detection.geometry}
              confirmDate={detection.confirmDate}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Forward-test position"
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
            description="The pattern paper engine has not created a position record for this detection yet."
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
        <SectionHeader title="Raw detection" />
        <details className="group overflow-hidden rounded-lg border">
          <summary className="hover:bg-muted/50 flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5 text-sm transition-colors select-none [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon
              className="text-muted-foreground size-3.5 shrink-0 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            <span className="font-medium">Detection document (JSON)</span>
            <span className="text-muted-foreground text-xs">
              geometry, quality sub-score and tradability as stored on the signal
            </span>
          </summary>
          <div className="border-t">
            <pre className="thin-scrollbar overflow-x-auto px-3 py-3 text-xs leading-relaxed">
              {JSON.stringify(detection, null, 2)}
            </pre>
          </div>
        </details>
      </section>
    </div>
  )
}
