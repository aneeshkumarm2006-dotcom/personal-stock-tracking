import type { ReactNode } from 'react'
import Link from 'next/link'

import { formatInt, formatIstDate } from '@/lib/format'
import { SectionHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { PatternScoreboard } from '@/components/scanner/PatternScoreboard'
import { PatternDetectionsTable } from '@/components/scanner/PatternDetectionsTable'
import type { PatternsOverview, PatternDayCount } from '@/lib/scanner/types'

// ── Patterns tab — the 3rd `/scanner` tab (Phase 11). Detects every researched
// chart pattern across the widest tradable NSE universe (~2,700 equities), paper-
// trades each into its own forward-test bucket, and answers the headline
// question: which chart patterns actually make money on the NSE? The tab leads
// with a plain-language orientation (mirroring the Intraday tab) so the numbers
// below — Quality, R:R, tiers, flags — read to someone who isn't a chartist.

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
        <PatternsIntro />
        <EmptyState
          title="Forward test armed — no detections published yet"
          description="Each trading morning the pattern engine scans the wide NSE universe, paper-trades every detection into its bucket, and publishes here. The per-pattern scoreboard and daily detections appear once the first run lands."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PatternsIntro />

      <section className="space-y-3">
        <SectionHeader
          title="Which patterns make money"
          hint="Forward-tested, one paper bucket per detector — the scoreboard settles as trades close"
        />
        <PatternScoreboard summary={summary} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Latest detections"
          hint={
            lastDetectionDate
              ? `Most recent session · ${formatIstDate(lastDetectionDate)}`
              : undefined
          }
        />
        {latestDay && latestDay.detections.length > 0 ? (
          <>
            <p className="text-muted-foreground text-xs">
              {formatInt(latestDay.total)} pattern
              {latestDay.total === 1 ? '' : 's'} spotted ·{' '}
              {formatInt(latestDay.tradable)} you could actually trade
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

// ── plain-language orientation ───────────────────────────────────────────────
// The tab used to open with three cryptic tier badges ("Tier 2 — expected-strong"
// …) and no explanation of Quality / R:R / flags. This card + glossary replaces
// that, folding the tier meaning into plain words alongside every other term the
// tables use.
function PatternsIntro() {
  const terms: { term: string; def: ReactNode }[] = [
    {
      term: 'Chart pattern',
      def: 'A recognisable shape in the price chart — a cup, a double bottom, a flag — that traders read as a clue to the next move.',
    },
    {
      term: 'Quality',
      def: 'How cleanly the shape formed, 0–100. Higher means a textbook example; lower means a rough one.',
    },
    {
      term: 'Buy · SL · TP1',
      def: 'The plan: the price it enters at (Buy), where it bails if wrong (SL, the stop-loss), and its first profit target (TP1).',
    },
    {
      term: 'R:R',
      def: 'Reward-to-risk. 1.9 means the target is worth about 1.9× what the trade risks losing.',
    },
    {
      term: 'Tier',
      def: 'How much we expect from a pattern. Tier 2 are the strong contenders; Tier 4 are long shots we track mainly to prove whether they work.',
    },
    {
      term: 'Tradable',
      def: 'Untradable names (illiquid, or under NSE surveillance / trade-to-trade rules) are still detected, but tracked separately since you could not cleanly trade them.',
    },
    {
      term: 'Outcome',
      def: 'What the paper trade did — waiting to enter (Pending), live (Open), or finished at its target or stop with the resulting profit or loss.',
    },
  ]
  return (
    <div className="bg-muted/30 ring-foreground/10 space-y-3 rounded-xl p-5 ring-1 sm:p-6">
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">What you&apos;re looking at</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          A paper (pretend-money) forward test of classic chart patterns. Every
          trading morning, about{' '}
          <span className="text-foreground font-medium">15 detectors</span> scan
          the widest tradable slice of the NSE (~2,700 stocks) for setups like
          cups, double bottoms and flags. Each one it spots is entered as a
          pretend trade and tracked to its target or stop — so over time the
          scoreboard settles the only question that matters:{' '}
          <span className="text-foreground font-medium">
            which chart patterns actually make money on the NSE after costs
          </span>
          , and which are just folklore.
        </p>
      </div>
      <details open className="group border-t pt-3">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-xs font-medium">
          <span className="group-open:hidden">▸ </span>
          <span className="hidden group-open:inline">▾ </span>
          Key terms
        </summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {terms.map((t) => (
            <div key={t.term} className="flex gap-2 text-sm">
              <dt className="text-foreground shrink-0 font-medium">{t.term}</dt>
              <dd className="text-muted-foreground">{t.def}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  )
}
