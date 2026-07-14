import Link from 'next/link'

import {
  getIntradayLive,
  getIntradayOverview,
  getOverview,
  getPatternsHealth,
  getPatternsOverview,
} from '@/lib/scanner/queries'
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
import { IntradayTab } from '@/components/scanner/IntradayTab'
import { PatternsTab } from '@/components/scanner/PatternsTab'
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
  const [data, intraday, patterns, patternHealth, intradayLive] =
    await Promise.all([
      getOverview(),
      getIntradayOverview(),
      getPatternsOverview(),
      getPatternsHealth(),
      getIntradayLive(),
    ])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Scanner"
        description="The forward-test cockpit — is each engine running, what did it decide today, and is it making money."
      />

      <Tabs defaultValue="swing">
        <TabsList>
          <TabsTrigger value="swing">Swing</TabsTrigger>
          <TabsTrigger value="intraday">Intraday</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
        </TabsList>
        <TabsContent value="swing" className="pt-4">
          <SwingTab data={data} />
        </TabsContent>
        <TabsContent value="intraday" className="pt-4">
          <IntradayTab data={intraday} initialLive={intradayLive} />
        </TabsContent>
        <TabsContent value="patterns" className="pt-4">
          <PatternsTab data={patterns} health={patternHealth} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
