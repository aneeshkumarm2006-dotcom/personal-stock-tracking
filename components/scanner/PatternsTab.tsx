import Link from 'next/link'

import { formatInt, formatIstDate, formatIstTime } from '@/lib/format'
import {
  behindLevel,
  istTodayKey,
  previousTradingDay,
  sessionsBehind,
} from '@/lib/scanner/freshness'
import { SectionHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusStrip, type StatusItem } from '@/components/scanner/StatusStrip'
import { PatternScoreboard } from '@/components/scanner/PatternScoreboard'
import { PatternDetectionsTable } from '@/components/scanner/PatternDetectionsTable'
import type {
  PatternsOverview,
  PatternDayCount,
  PatternHealth,
} from '@/lib/scanner/types'

// ── Patterns tab — status-first, decision-first (Prem's 2026-07-14 redesign).
// Order: Right now (did the engine run + what it found) → latest detections →
// which patterns make money → earlier days. All theory sits in one small
// collapsed block at the bottom.

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

// ── the ONLY theory on the tab — one compact collapsed block at the bottom ───
function PatternsHowItWorks() {
  const terms: { term: string; def: string }[] = [
    {
      term: 'Chart pattern',
      def: 'A recognisable shape in the price chart — a cup, a double bottom, a flag — that traders read as a clue to the next move.',
    },
    {
      term: 'Quality',
      def: 'How cleanly the shape formed, 0–100. Higher = closer to the textbook example.',
    },
    {
      term: 'Buy above · Stop · Target',
      def: 'The plan for each find: enter if price crosses Buy, bail at the Stop if wrong, book at the Target if right.',
    },
    {
      term: 'R:R',
      def: 'Reward-to-risk. 1.9 means the target is worth about 1.9× what the trade risks.',
    },
    {
      term: 'Strong bet / Long shot',
      def: 'Our expectation going in. Strong bets are the researched setups; long shots are tracked mainly to prove whether they work at all.',
    },
    {
      term: 'Tradable',
      def: 'Untradable names (illiquid, or under NSE surveillance / trade-to-trade rules) are still detected but scored separately — you couldn’t cleanly trade them.',
    },
    {
      term: 'Result',
      def: 'What the paper trade did — waiting to enter, live, or finished at its target or stop.',
    },
  ]
  return (
    <details className="bg-card ring-foreground/10 group rounded-xl ring-1">
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 sm:p-5">
        <h3 className="text-sm font-semibold">
          How this test works — rules &amp; key terms
        </h3>
        <span className="text-muted-foreground shrink-0 text-xs">
          <span className="group-open:hidden">show ▾</span>
          <span className="hidden group-open:inline">hide ▴</span>
        </span>
      </summary>
      <div className="space-y-5 border-t p-4 sm:p-5">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Every trading morning, 15 detectors scan about 2,700 NSE stocks for
          classic chart shapes. Each find becomes a paper (pretend-money) trade
          at the shown levels and is tracked to its target or stop. Over weeks,
          the scoreboard settles the real question: which chart patterns
          actually make money on the NSE after costs — and which are folklore.
          No real money is at risk.
        </p>
        <div className="border-t pt-4">
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Key terms
          </p>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {terms.map((t) => (
              <div key={t.term} className="flex gap-2 text-sm">
                <dt className="text-foreground shrink-0 font-medium">
                  {t.term}
                </dt>
                <dd className="text-muted-foreground">{t.def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </details>
  )
}

export function PatternsTab({
  data,
  health,
}: {
  data: PatternsOverview
  health: PatternHealth
}) {
  const { summary, latestDay, recentDays } = data
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

      <section className="space-y-3">
        <SectionHeader
          title="Latest detections"
          hint={
            latestDay ? `session of ${formatIstDate(latestDay.date)}` : undefined
          }
        />
        {latestDay && latestDay.detections.length > 0 ? (
          <>
            <p className="text-muted-foreground text-sm">
              {formatInt(latestDay.total)} pattern
              {latestDay.total === 1 ? '' : 's'} found ·{' '}
              {formatInt(latestDay.tradable)} tradable. Each one is
              paper-traded at the shown levels — the Result column tracks what
              happened.
            </p>
            <PatternDetectionsTable detections={latestDay.detections} />
          </>
        ) : (
          <EmptyState
            title="Nothing found yet"
            description="Each trading morning the engine scans ~2,700 NSE stocks for chart patterns. Finds land here with their buy / stop / target plan — days with zero finds are normal."
          />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Which patterns make money"
          hint="the running verdict — settles as paper trades close"
        />
        <PatternScoreboard summary={summary} />
      </section>

      {recentDays.length > 1 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Earlier days"
            hint="open any day for its full list"
          />
          {/* recentDays[0] is the latest day, already shown in full above. */}
          <RecentDaysStrip days={recentDays.slice(1)} />
        </section>
      ) : null}

      <PatternsHowItWorks />
    </div>
  )
}
