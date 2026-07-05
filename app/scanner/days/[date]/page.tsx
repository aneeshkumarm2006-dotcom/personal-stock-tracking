import Link from 'next/link'

import { getDay } from '@/lib/scanner/queries'
import { PageHeader, SectionHeader } from '@/components/PageHeader'
import { DaySignalsTable } from '@/components/scanner/DaySignalsTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatInt, formatIstDate, formatIstDateTime } from '@/lib/format'
import type { ScannerRegime, ScannerRun } from '@/lib/scanner/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ date: string }> }

// Human-readable status for the page description. Falls back to the raw status
// for any value the engine adds later (access is guarded with ?? below).
const STATUS_LABELS: Record<string, string> = {
  ok: 'Scan completed',
  'no-signals': 'Ran — no signals',
  holiday: 'Market holiday',
  failed: 'Scan failed',
}

// Run status → Badge. Duplicated per slice on purpose (kept local so the days
// package stays independent of the other scanner slices).
function statusBadge(status: string) {
  switch (status) {
    case 'ok':
      return (
        <Badge variant="outline" className="bg-gain/10 text-gain border-transparent">
          OK
        </Badge>
      )
    case 'no-signals':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          No signals
        </Badge>
      )
    case 'holiday':
      return <Badge variant="secondary">Holiday</Badge>
    case 'failed':
      return (
        <Badge variant="outline" className="bg-loss/10 text-loss border-transparent">
          Failed
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

// Neutral yes/no chip for a boolean regime flag (no good/bad colouring — some of
// these flags are "bad-when-true", e.g. blocksLong, so we stay neutral).
function BoolChip({ label, value }: { label: string; value?: boolean }) {
  const on = value === true
  return (
    <Badge
      variant={on ? 'secondary' : 'outline'}
      className={on ? undefined : 'text-muted-foreground'}
    >
      {label}: {on ? 'Yes' : 'No'}
    </Badge>
  )
}

function RegimeBlock({ regime }: { regime: ScannerRegime }) {
  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Regime</span>
        {regime.index ? <Badge variant="outline">{regime.index}</Badge> : null}
        {regime.strengthPoints != null ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            Strength {regime.strengthPoints}
          </span>
        ) : null}
        {regime.stale ? (
          <Badge variant="outline" className="text-muted-foreground">
            Stale
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <BoolChip label="Blocks long" value={regime.blocksLong} />
        <BoolChip label="RS sleeve flat" value={regime.rsSleeveFlat} />
        <BoolChip label="Above 200DMA" value={regime.above200dma} />
        <BoolChip label="Above 20DMA low" value={regime.above20dmaLow} />
      </div>
    </div>
  )
}

function RunSummary({ run }: { run: ScannerRun }) {
  const regime = run.regime ?? null
  const errors = run.errors ?? []
  const warnings = run.warnings ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Run summary</CardTitle>
            {statusBadge(run.status)}
            {run.degraded ? (
              <Badge
                variant="outline"
                className="bg-loss/10 text-loss border-transparent"
              >
                Degraded
              </Badge>
            ) : null}
          </div>
          {run.engineVersion ? (
            <span className="text-muted-foreground text-xs">
              Engine {run.engineVersion}
            </span>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs">Signals</dt>
            <dd className="text-sm font-medium tabular-nums">
              {formatInt(run.signalCount ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Universe</dt>
            <dd className="text-sm font-medium tabular-nums">
              {run.universeCount != null ? formatInt(run.universeCount) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Started</dt>
            <dd className="text-sm font-medium">
              {run.startedAt ? formatIstDateTime(run.startedAt) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Finished</dt>
            <dd className="text-sm font-medium">
              {run.finishedAt ? formatIstDateTime(run.finishedAt) : '—'}
            </dd>
          </div>
        </dl>

        {regime ? <RegimeBlock regime={regime} /> : null}

        {errors.length > 0 ? (
          <div className="space-y-1 border-t pt-4">
            <p className="text-loss text-xs font-medium">Errors</p>
            <ul className="text-muted-foreground list-inside list-disc text-xs">
              {errors.map((e, i) => (
                <li key={`err-${i}`}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="space-y-1 border-t pt-4">
            <p className="text-muted-foreground text-xs font-medium">Warnings</p>
            <ul className="text-muted-foreground list-inside list-disc text-xs">
              {warnings.map((w, i) => (
                <li key={`warn-${i}`}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default async function ScannerDayDetailPage({ params }: RouteContext) {
  const { date } = await params
  const { run, signals } = await getDay(date)

  const status = run?.status ?? null
  const description = status
    ? (STATUS_LABELS[status] ?? status)
    : 'No scan recorded for this date.'

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title={formatIstDate(date)}
        description={description}
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/scanner/days" />}
          >
            All days
          </Button>
        }
      />

      {run == null && signals.length === 0 ? (
        <EmptyState
          title="No scan for this date"
          description="No scanner run or signals were recorded for this session."
        />
      ) : (
        <>
          {run ? <RunSummary run={run} /> : null}

          <section className="space-y-3">
            <SectionHeader
              title="Ranked signals"
              hint={
                signals.length > 0
                  ? `${formatInt(signals.length)} ${signals.length === 1 ? 'signal' : 'signals'}`
                  : undefined
              }
            />
            <DaySignalsTable signals={signals} />
          </section>
        </>
      )}
    </div>
  )
}
