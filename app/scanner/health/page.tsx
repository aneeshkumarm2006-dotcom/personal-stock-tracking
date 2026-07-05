import Link from 'next/link'

import { getHealth } from '@/lib/scanner/queries'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, SectionHeader } from '@/components/PageHeader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GateFunnel } from '@/components/scanner/GateFunnel'
import { formatInt, formatIstDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'

// Big color-coded status pill for the latest run (ok=gain, no-signals=muted,
// holiday=secondary, failed=loss). Local to this slice to keep packages decoupled.
function bigStatus(status: string): { label: string; className: string } {
  switch (status) {
    case 'ok':
      return { label: 'OK', className: 'bg-gain/10 text-gain ring-gain/30' }
    case 'no-signals':
      return {
        label: 'No signals',
        className: 'bg-muted text-muted-foreground ring-border',
      }
    case 'holiday':
      return {
        label: 'Holiday',
        className: 'bg-secondary text-secondary-foreground ring-border',
      }
    case 'failed':
      return { label: 'Failed', className: 'bg-loss/10 text-loss ring-loss/30' }
    default:
      return {
        label: status || 'Unknown',
        className: 'bg-muted text-muted-foreground ring-border',
      }
  }
}

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
      return <Badge variant="outline">{status || 'Unknown'}</Badge>
  }
}

// Green when data is fresh (< 30h), amber up to 3 days, red beyond.
function freshnessClass(ageHours: number | null): string {
  if (ageHours == null) return 'text-muted-foreground'
  if (ageHours < 30) return 'text-gain'
  if (ageHours < 72) return 'text-amber-500'
  return 'text-loss'
}

function formatAge(ageHours: number | null): string {
  if (ageHours == null) return '—'
  if (ageHours < 1) return `${Math.round(ageHours * 60)} min ago`
  if (ageHours < 48) return `${ageHours.toFixed(1)} h ago`
  return `${(ageHours / 24).toFixed(1)} d ago`
}

export default async function ScannerHealthPage() {
  const health = await getHealth()
  const { latestRun, recentRuns, lastRunDate, ageHours } = health

  if (latestRun == null) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Scanner health"
          description="Latest engine run status, gate funnel, data freshness, and recent run history."
        />
        <EmptyState
          title="No scans have run yet"
          description="Run health appears here once the scanner engine has published its first run."
        />
      </div>
    )
  }

  const big = bigStatus(latestRun.status)
  const errors = latestRun.errors ?? []
  const warnings = latestRun.warnings ?? []
  const failedRuns = recentRuns.filter((r) => r.status === 'failed')
  const stale = ageHours != null && ageHours >= 30

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Scanner health"
        description="Latest engine run status, gate funnel, data freshness, and recent run history."
      />

      <section className="space-y-3">
        <SectionHeader
          title="Latest run"
          hint={latestRun.date || undefined}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-4 py-1.5 text-base font-semibold ring-1 ${big.className}`}
                >
                  {big.label}
                </span>
                {latestRun.degraded ? (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-500 border-transparent"
                  >
                    Degraded
                  </Badge>
                ) : null}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Universe</dt>
                  <dd className="font-medium tabular-nums">
                    {formatInt(latestRun.universeCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Signals</dt>
                  <dd className="font-medium tabular-nums">
                    {formatInt(latestRun.signalCount)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data freshness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-muted-foreground text-xs">Data age</div>
                <div
                  className={`text-2xl font-semibold tabular-nums ${freshnessClass(ageHours)}`}
                >
                  {formatAge(ageHours)}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Last run</dt>
                  <dd className="font-medium">{lastRunDate ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Finished</dt>
                  <dd className="font-medium">
                    {latestRun.finishedAt
                      ? formatIstDateTime(latestRun.finishedAt)
                      : '—'}
                  </dd>
                </div>
              </dl>
              {stale ? (
                <p className="text-amber-500 text-xs">
                  Data is more than 30 hours old — the latest session may not have
                  published yet.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="text-right font-medium">
                    {latestRun.startedAt
                      ? formatIstDateTime(latestRun.startedAt)
                      : '—'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Finished</dt>
                  <dd className="text-right font-medium">
                    {latestRun.finishedAt
                      ? formatIstDateTime(latestRun.finishedAt)
                      : '—'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Published</dt>
                  <dd className="text-right font-medium">
                    {latestRun.publishedAt
                      ? formatIstDateTime(latestRun.publishedAt)
                      : '—'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Engine</dt>
                  <dd className="text-right font-mono text-xs break-all">
                    {latestRun.engineVersion ?? '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Gate funnel"
          hint="Universe narrowed down to published signals"
        />
        <Card>
          <CardContent>
            {latestRun.gateFunnel ? (
              <GateFunnel
                gateFunnel={latestRun.gateFunnel}
                universeCount={latestRun.universeCount}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                No gate-funnel data for this run.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Errors & warnings" />
        {errors.length === 0 && warnings.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No errors or warnings reported for the latest run.
          </p>
        ) : (
          <div className="space-y-2">
            {errors.map((msg, i) => (
              <div
                key={`err-${i}`}
                className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm"
              >
                {msg}
              </div>
            ))}
            {warnings.map((msg, i) => (
              <div
                key={`warn-${i}`}
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-600 dark:text-amber-500"
              >
                {msg}
              </div>
            ))}
          </div>
        )}
        {failedRuns.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            Recent failed runs: {failedRuns.map((r) => r.date).join(', ')}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Recent runs"
          hint={`${recentRuns.length} shown`}
        />
        {recentRuns.length === 0 ? (
          <EmptyState title="No runs yet" />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table containerClassName="thin-scrollbar">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Universe</TableHead>
                  <TableHead className="text-right">Signals</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRuns.map((r) => (
                  <TableRow key={r.id || r.date}>
                    <TableCell className="font-medium">
                      {r.date ? (
                        <Link
                          href={`/scanner/days/${r.date}`}
                          className="hover:underline"
                        >
                          {r.date}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(r.universeCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(r.signalCount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.finishedAt ? formatIstDateTime(r.finishedAt) : '—'}
                    </TableCell>
                    <TableCell>
                      {r.degraded ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-500 border-transparent"
                        >
                          Degraded
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
