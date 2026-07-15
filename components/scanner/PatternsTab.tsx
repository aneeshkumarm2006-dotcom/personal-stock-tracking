import Link from 'next/link'

import {
  formatInt,
  formatIstDate,
  formatIstTime,
} from '@/lib/format'
import {
  behindLevel,
  istTodayKey,
  previousTradingDay,
  sessionsBehind,
} from '@/lib/scanner/freshness'
import { SectionHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusStrip, type StatusItem } from '@/components/scanner/StatusStrip'
import { PatternStatCards } from '@/components/scanner/PatternStatCards'
import { ScannerEquityChart } from '@/components/scanner/ScannerEquityChart'
import { ScannerLevelsTable } from '@/components/scanner/ScannerLevelsTable'
import { PatternScoreboard } from '@/components/scanner/PatternScoreboard'
import { PatternDetectionsTable } from '@/components/scanner/PatternDetectionsTable'
import type {
  PatternsOverview,
  PatternDayCount,
  PatternHealth,
} from '@/lib/scanner/types'

// ── Patterns tab — mirrors the Swing tab's section rhythm (Prem, 2026-07-15):
// Right now → stat cards → equity curve → scoreboard → latest detections →
// trade levels → earlier days. No theory blocks anywhere; the status strip is
// the log of whether the 4 AM run has published yet.

function RecentDaysStrip({ days }: { days: PatternDayCount[] }) {
  if (days.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {days.map((d) => (
        <Link
          key={d.date}
          href={`/scanner/patterns/days/${d.date}`}
          className="bg-card ring-foreground/10 hover:bg-muted/50 rounded-lg p-3 ring-1 transition-colors"
        >
          <span className="text-sm font-medium">{formatIstDate(d.date)}</span>
          <p className="text-muted-foreground mt-1 text-xs tabular-nums">
            {formatInt(d.total)} found
            <span className="text-gain">
              {' '}
              · {formatInt(d.tradable)} tradable
            </span>
          </p>
        </Link>
      ))}
    </div>
  )
}

// The three health checks: did the engine run · what it last found · how far
// the verdict book has filled. Server-rendered — pattern data only changes once
// a day (the 4 AM run), so no polling is needed.
function buildStatusItems(health: PatternHealth): StatusItem[] {
  const todayKey = istTodayKey()
  const expected = previousTradingDay(todayKey)

  // "Did it run" rides the paper book's as-of session (it advances every run,
  // even on days with zero new detections); first-ever runs may predate the
  // stats doc, so fall back to the last detection date.
  const ranBasis = health.asOf ?? health.lastDetectionDate
  let engine: StatusItem
  if (!ranBasis) {
    engine = {
      label: 'Pattern engine',
      level: 'muted',
      value: 'Hasn’t run yet',
      sub: 'the first 4 AM run will publish here',
    }
  } else {
    const behind = sessionsBehind(ranBasis, expected)
    const level = behindLevel(behind)
    engine = {
      label: 'Pattern engine',
      level,
      value:
        level === 'ok'
          ? 'Up to date'
          : behind === 1
            ? '1 session behind'
            : `${behind} sessions behind`,
      sub:
        level === 'ok'
          ? `covered through ${formatIstDate(ranBasis)}`
          : level === 'warn'
            ? `last ${formatIstDate(ranBasis)} — holiday, or the 4 AM run hasn’t happened yet`
            : `last ${formatIstDate(ranBasis)} — check the 4 AM scheduled task`,
    }
  }

  let found: StatusItem
  if (!health.lastDetectionDate) {
    found = {
      label: 'Latest find',
      level: 'muted',
      value: 'Nothing found yet',
      sub: 'most days only a handful of stocks qualify',
    }
  } else {
    const fresh = health.lastDetectionDate >= expected
    found = {
      label: 'Latest find',
      level: fresh ? 'ok' : 'muted',
      value: `${formatInt(health.detectionCountLastDay)} pattern${health.detectionCountLastDay === 1 ? '' : 's'} · ${formatIstDate(health.lastDetectionDate)}`,
      sub: fresh
        ? health.lastPublishedAt
          ? `published ${formatIstTime(health.lastPublishedAt)}`
          : undefined
        : 'nothing newer — days with zero finds are normal',
    }
  }

  const progress: StatusItem = {
    label: 'Verdict progress',
    level: health.totalFills > 0 ? 'ok' : 'muted',
    value: `${formatInt(health.totalFills)} paper trade${health.totalFills === 1 ? '' : 's'} · ${formatInt(health.bucketCount)} pattern${health.bucketCount === 1 ? '' : 's'}`,
    sub: 'each pattern gets its verdict at ~30 closed trades',
  }

  return [engine, found, progress]
}

export function PatternsTab({
  data,
  health,
}: {
  data: PatternsOverview
  health: PatternHealth
}) {
  const { summary, latestDay, recentDays, daily, positions } = data
  const statusItems = buildStatusItems(health)

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader
          title="Right now"
          hint="is it running, and what did it find"
          actions={
            <Link
              href="/scanner/health"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
            >
              Full system health →
            </Link>
          }
        />
        <StatusStrip items={statusItems} />
      </section>

      {summary && <PatternStatCards summary={summary} />}

      {summary && (
        <section className="space-y-3">
          <SectionHeader
            title="Equity curve"
            hint="Realized paper equity and max drawdown by day"
          />
          {daily.length > 0 ? (
            <div className="bg-card ring-foreground/10 rounded-xl p-4 ring-1">
              <ScannerEquityChart daily={daily} />
            </div>
          ) : (
            <EmptyState
              title="No daily history yet"
              description="The equity curve appears once the first paper trades close."
            />
          )}
        </section>
      )}

      <section className="space-y-3">
        <SectionHeader
          title="Which patterns make money"
          hint="The running verdict per pattern — settles as trades close"
        />
        <PatternScoreboard summary={summary} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Latest detections"
          hint={
            latestDay ? `Session of ${formatIstDate(latestDay.date)}` : undefined
          }
        />
        {latestDay && latestDay.detections.length > 0 ? (
          <PatternDetectionsTable detections={latestDay.detections} />
        ) : (
          <EmptyState
            title="No detections yet"
            description="Days with zero finds are normal — the next scan publishes at the 4 AM run."
          />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Trade levels"
          hint="Entry, stop, targets and P&L per paper trade"
        />
        <ScannerLevelsTable positions={positions} />
      </section>

      {recentDays.length > 1 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Earlier days"
            hint="Open any day for its full list"
          />
          {/* recentDays[0] is the latest day, already shown in full above. */}
          <RecentDaysStrip days={recentDays.slice(1)} />
        </section>
      ) : null}
    </div>
  )
}
