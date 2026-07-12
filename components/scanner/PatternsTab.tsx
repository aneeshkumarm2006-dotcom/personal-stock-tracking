import Link from 'next/link'

import { formatInt, formatIstDate } from '@/lib/format'
import { SectionHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PatternScoreboard } from '@/components/scanner/PatternScoreboard'
import { PatternDetectionsTable } from '@/components/scanner/PatternDetectionsTable'
import type { PatternsOverview, PatternDayCount } from '@/lib/scanner/types'

// ── Patterns tab — the 3rd `/scanner` tab (Phase 11). Detects every researched
// chart pattern across the widest tradable NSE universe (~2,700 equities), paper-
// trades each into its own forward-test bucket, and answers the headline
// question: which chart patterns actually make money on the NSE? Doctrine (D-H):
// detect everything, don't pre-exclude from US stats, gate at the trade layer —
// weak patterns are falsified with our own data.

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
            {formatInt(d.total)} detections
            <span className="text-gain"> · {formatInt(d.tradable)} tradable</span>
          </p>
        </Link>
      ))}
    </div>
  )
}

export function PatternsTab({ data }: { data: PatternsOverview }) {
  const { summary, latestDay, recentDays, lastDetectionDate } = data
  const hasAnything = !!summary || !!latestDay || recentDays.length > 0

  if (!hasAnything) {
    return (
      <div className="space-y-6">
        <IntroCard />
        <EmptyState
          title="Forward test armed — no detections published yet"
          description="Each trading morning the pattern engine scans the wide NSE universe, paper-trades every detection into its bucket, and publishes here. The per-pattern scoreboard and daily detections appear once the first run lands."
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <IntroCard />

      <section className="space-y-3">
        <SectionHeader
          title="Per-pattern scoreboard"
          hint="Which chart patterns actually make money — forward-tested, one bucket per detector"
        />
        <PatternScoreboard summary={summary} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Detections"
          hint={
            lastDetectionDate
              ? `Latest session · ${formatIstDate(lastDetectionDate)}`
              : undefined
          }
        />
        {latestDay && latestDay.detections.length > 0 ? (
          <>
            <p className="text-muted-foreground text-xs">
              {formatInt(latestDay.total)} detected ·{' '}
              {formatInt(latestDay.tradable)} tradable
            </p>
            <PatternDetectionsTable detections={latestDay.detections} />
          </>
        ) : (
          <EmptyState
            title="No detections in the latest session"
            description="No chart patterns confirmed a breakout on the most recent trading day."
          />
        )}
      </section>

      {recentDays.length > 1 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Earlier days"
            hint="Detections per session — open any day for the full list"
          />
          {/* recentDays[0] is the latest day, already shown in full above. */}
          <RecentDaysStrip days={recentDays.slice(1)} />
        </section>
      ) : null}
    </div>
  )
}

function IntroCard() {
  return (
    <div className="bg-card ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            Chart patterns · full-NSE forward test
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Every trading morning, ~15 pattern detectors (Tiers 1–4) scan the
            widest tradable NSE universe. Each detection auto-enters its own paper
            bucket, so the scoreboard settles — with our own data — which setups
            carry an edge net of costs and which are falsified.
          </p>
        </div>
        <Badge className="bg-secondary text-secondary-foreground shrink-0 border-transparent">
          Forward test · detect-everything
        </Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="bg-primary/10 text-primary border-transparent">
          Tier 2 — expected-strong
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          Tier 4 — expected-weak (falsification)
        </Badge>
        <Badge
          variant="outline"
          className="bg-amber-500/10 text-amber-600 border-transparent dark:text-amber-500"
        >
          Tier 3 — exit/veto layer
        </Badge>
      </div>
    </div>
  )
}
