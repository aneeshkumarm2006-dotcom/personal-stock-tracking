import Link from 'next/link'
import type { ReactNode } from 'react'

import { getOverview } from '@/lib/scanner/queries'
import { formatInt, formatIstDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, SectionHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScannerStatCards } from '@/components/scanner/ScannerStatCards'
import { ScannerEquityChart } from '@/components/scanner/ScannerEquityChart'
import { PerStrategyTable } from '@/components/scanner/PerStrategyTable'
import { PerStockTable } from '@/components/scanner/PerStockTable'
import { ScannerLevelsTable } from '@/components/scanner/ScannerLevelsTable'
import type { ScannerRun } from '@/lib/scanner/types'

export const dynamic = 'force-dynamic'

// Local (per-slice) status → Badge styling — intentionally not shared with other
// scanner slices so parallel packages stay decoupled.
function statusBadge(status: string) {
  const cls =
    status === 'ok'
      ? 'bg-gain/10 text-gain'
      : status === 'failed'
        ? 'bg-loss/10 text-loss'
        : status === 'no-signals'
          ? 'bg-muted text-muted-foreground'
          : 'bg-secondary text-secondary-foreground'
  return (
    <Badge className={cn('border-transparent', cls)}>{status || 'unknown'}</Badge>
  )
}

function RecentDays({ runs }: { runs: ScannerRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No sessions yet"
        description="Recent scanner sessions will be listed here once they run."
      />
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {runs.map((run) => (
        <Link
          key={run.id || run.date}
          href={`/scanner/days/${run.date}`}
          className="bg-card ring-foreground/10 hover:bg-muted/50 rounded-lg p-3 ring-1 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{formatIstDate(run.date)}</span>
            {statusBadge(run.status)}
          </div>
          <p className="text-muted-foreground mt-1 text-xs tabular-nums">
            {formatInt(run.signalCount)} signals
          </p>
        </Link>
      ))}
    </div>
  )
}

// ── Long Term tab — idea only. No detection engine, paper-test, or publish is
// wired for this yet; the content below is a spec placeholder (per Prem: "just
// fill the idea, no need to implement anything").
function LongTermTab() {
  const rules: { label: string; body: ReactNode }[] = [
    {
      label: 'Entry',
      body: (
        <>
          50-DMA crosses <span className="font-medium">above</span> the 200-DMA —
          the golden cross (<span className="tabular-nums">sma50 &gt; sma200</span>{' '}
          today, <span className="tabular-nums">sma50 ≤ sma200</span> the prior
          session).
        </>
      ),
    },
    {
      label: 'Exit',
      body: (
        <>
          Death cross — the 50-DMA falls back below the 200-DMA — or a long-term
          trailing stop (e.g. a weekly close below the 200-DMA).
        </>
      ),
    },
    {
      label: 'Horizon',
      body: <>Position trades held weeks to months, not the swing setups’ days.</>,
    },
    {
      label: 'Universe',
      body: <>Same NIFTY500 EQ universe and safety gates as the swing scanner.</>,
    },
  ]

  const readiness: { ready: boolean; text: string }[] = [
    { ready: true, text: 'sma50 & sma200 already computed per session in enrich_daily' },
    { ready: true, text: 'Series is split/bonus-adjusted — no fake crosses from corporate actions' },
    { ready: true, text: '~290 usable sessions after the 200-DMA warm-up (~14 months)' },
    { ready: false, text: 'Cross-detection helper / strategy module (not written)' },
    { ready: false, text: 'Paper-test exit model tuned for a long horizon (not written)' },
    { ready: false, text: 'Mongo publish + website tab wiring for live signals (not written)' },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-card ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Golden Cross · 50 / 200 DMA</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              A long-horizon trend-following signal, kept separate from the
              short-term swing setups.
            </p>
          </div>
          <Badge className="bg-secondary text-secondary-foreground shrink-0 border-transparent">
            Idea · not implemented
          </Badge>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {rules.map((r) => (
            <div key={r.label} className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {r.label}
              </p>
              <p className="text-sm">{r.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
        <SectionHeader
          title="Data readiness"
          hint="What already exists vs. what still needs building"
        />
        <ul className="mt-3 space-y-2">
          {readiness.map((r) => (
            <li key={r.text} className="flex items-start gap-2 text-sm">
              <span
                className={cn(
                  'mt-0.5 shrink-0 font-medium',
                  r.ready ? 'text-gain' : 'text-muted-foreground'
                )}
                aria-hidden
              >
                {r.ready ? '✓' : '○'}
              </span>
              <span className={r.ready ? '' : 'text-muted-foreground'}>{r.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SwingTab({ data }: { data: Awaited<ReturnType<typeof getOverview>> }) {
  if (!data.summary) {
    return (
      <EmptyState
        title="No scans have run yet"
        description="Once the scanner publishes its first run, your equity curve, per-strategy stats and daily signals will appear here."
      />
    )
  }

  const { summary, daily, recentRuns, byStock, positions } = data
  const byStrategy = summary.byStrategy ?? {}

  return (
    <div className="space-y-8">
      <ScannerStatCards data={data} />

      <section className="space-y-3">
        <SectionHeader
          title="Equity curve"
          hint="Portfolio equity and max drawdown by session"
        />
        {daily.length > 0 ? (
          <div className="bg-card ring-foreground/10 rounded-xl p-4 ring-1">
            <ScannerEquityChart daily={daily} />
          </div>
        ) : (
          <EmptyState
            title="No daily history yet"
            description="Daily equity snapshots appear after the first full session."
          />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="By strategy"
          hint="Closed and open trade stats per strategy"
        />
        <PerStrategyTable byStrategy={byStrategy} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Stocks"
          hint="Per-stock stats — active (currently held) or closed"
        />
        <PerStockTable byStock={byStock} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Trade levels"
          hint="Entry, stop, targets and live P&L per position"
        />
        <ScannerLevelsTable positions={positions} />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Recent days" hint="Latest scanner sessions" />
        <RecentDays runs={recentRuns} />
      </section>
    </div>
  )
}

export default async function ScannerOverviewPage() {
  const data = await getOverview()

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Scanner"
        description="Forward-test performance of the scanner — short-term swing setups and long-term signals."
      />

      <Tabs defaultValue="swing">
        <TabsList>
          <TabsTrigger value="swing">Swing</TabsTrigger>
          <TabsTrigger value="long-term">Long Term</TabsTrigger>
        </TabsList>
        <TabsContent value="swing" className="pt-4">
          <SwingTab data={data} />
        </TabsContent>
        <TabsContent value="long-term" className="pt-4">
          <LongTermTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
