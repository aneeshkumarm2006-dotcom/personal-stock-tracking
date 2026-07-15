import Link from 'next/link'

import { formatInt, formatIstDate } from '@/lib/format'
import { SectionHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { PatternStatCards } from '@/components/scanner/PatternStatCards'
import { ScannerEquityChart } from '@/components/scanner/ScannerEquityChart'
import { ScannerLevelsTable } from '@/components/scanner/ScannerLevelsTable'
import { PatternScoreboard } from '@/components/scanner/PatternScoreboard'
import { PatternDetectionsTable } from '@/components/scanner/PatternDetectionsTable'
import type { PatternsOverview, PatternDayCount } from '@/lib/scanner/types'

// ── Patterns tab — same section rhythm and look as the Swing tab (Prem,
// 2026-07-16): stat cards → equity curve → scoreboard → latest detections →
// trade levels → earlier days. No status strip — the tab is a plain mirror of
// Swing.

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

export function PatternsTab({ data }: { data: PatternsOverview }) {
  const { summary, latestDay, recentDays, daily, positions } = data

  return (
    <div className="space-y-8">
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
