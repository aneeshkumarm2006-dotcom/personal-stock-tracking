import { cn } from '@/lib/utils'
import { formatCurrency, formatIstDate } from '@/lib/format'
import { istTodayKey, previousTradingDay } from '@/lib/scanner/freshness'
import { SectionHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { IntradayStatCards } from '@/components/scanner/IntradayStatCards'
import { IntradayEquityChart } from '@/components/scanner/IntradayEquityChart'
import type {
  IntradayOverview,
  IntradayRun,
  IntradayTrade,
} from '@/lib/scanner/types'

// ── Intraday tab — same section rhythm and look as the Swing tab (Prem,
// 2026-07-16): stat cards → equity curve → by exit → every pick → session
// history. No status strip, live banner or replay block — the tab is a plain
// mirror of Swing.

function pnlCls(v: number | null | undefined) {
  if (v == null || v === 0) return 'text-muted-foreground'
  return v > 0 ? 'text-gain' : 'text-loss'
}

// ── per-exit breakdown — the intraday twin of the swing "By strategy" table ──
function ByExitTable({
  summary,
}: {
  summary: NonNullable<IntradayOverview['summary']>
}) {
  const rows = [
    { key: 'A', blurb: '1.5× risk target', stats: summary.byArm.A },
    { key: 'B', blurb: '2× risk target', stats: summary.byArm.B },
  ]
  const diff = summary.byArm.B.netPnl - summary.byArm.A.netPnl
  const traded = Math.max(summary.byArm.A.trades, summary.byArm.B.trades) > 0
  const leader = !traded || diff === 0 ? null : diff > 0 ? 'B' : 'A'

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table containerClassName="thin-scrollbar">
        <TableHeader>
          <TableRow>
            <TableHead>Exit</TableHead>
            <TableHead className="text-right">Trades</TableHead>
            <TableHead className="text-right">Wins</TableHead>
            <TableHead className="text-right">Win rate</TableHead>
            <TableHead className="text-right">Avg R</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Costs</TableHead>
            <TableHead className="text-right">Net P&amp;L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ key, blurb, stats }) => (
            <TableRow key={key}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Exit {key}</span>
                  {leader === key && (
                    <span className="bg-gain/10 text-gain rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                      winning
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground text-xs">{blurb}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {stats.trades}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {stats.wins}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {stats.winRate != null ? `${stats.winRate}%` : '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {stats.avgR != null ? `${stats.avgR}R` : '—'}
              </TableCell>
              <TableCell
                className={cn('text-right tabular-nums', pnlCls(stats.grossPnl))}
              >
                {formatCurrency(stats.grossPnl)}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {formatCurrency(stats.costs)}
              </TableCell>
              <TableCell
                className={cn('text-right tabular-nums', pnlCls(stats.netPnl))}
              >
                {formatCurrency(stats.netPnl)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function runStatusBadge(status: string) {
  const cls =
    status === 'ok'
      ? 'bg-gain/10 text-gain'
      : status === 'failed'
        ? 'bg-loss/10 text-loss'
        : 'bg-muted text-muted-foreground'
  const label =
    status === 'ok' ? 'traded' : status === 'failed' ? 'failed' : 'no trade'
  return <Badge className={cn('border-transparent', cls)}>{label}</Badge>
}

// ── every pick — one row per trade, both exits side by side ─────────────────
function ArmResult({ trade }: { trade: IntradayTrade | undefined }) {
  if (!trade) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={cn('font-medium tabular-nums', pnlCls(trade.netPnl))}>
        {trade.netPnl != null ? formatCurrency(trade.netPnl) : '—'}
      </span>
      <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
        <span
          className={cn(
            trade.exitReason === 'TP'
              ? 'text-gain'
              : trade.exitReason === 'SL'
                ? 'text-loss'
                : 'text-muted-foreground',
          )}
        >
          {trade.exitReason === 'TP'
            ? 'target'
            : trade.exitReason === 'SL'
              ? 'stop'
              : (trade.exitReason ?? '—')}
        </span>
        {trade.rMultiple != null && (
          <span className="text-muted-foreground">{trade.rMultiple}R</span>
        )}
      </span>
    </div>
  )
}

function PicksTable({ trades }: { trades: IntradayTrade[] }) {
  const traded = trades.filter((t) => t.status === 'TRADED')
  if (traded.length === 0) {
    return (
      <EmptyState
        title="No picks yet"
        description="Once a session triggers a pick, it appears here with both exits side by side."
      />
    )
  }
  // Both arm rows collapse under one pick, newest session first.
  const byPick = new Map<string, IntradayTrade[]>()
  for (const t of traded) {
    const key = `${t.date}__${t.symbol}`
    const arr = byPick.get(key) ?? []
    arr.push(t)
    byPick.set(key, arr)
  }
  const picks = [...byPick.values()]
    .map((rows) => ({
      base: rows[0]!,
      a: rows.find((r) => r.arm === 'A'),
      b: rows.find((r) => r.arm === 'B'),
    }))
    .sort((x, y) => y.base.date.localeCompare(x.base.date))
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table containerClassName="thin-scrollbar">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Exit A · 1.5×</TableHead>
            <TableHead className="text-right">Exit B · 2×</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {picks.map(({ base, a, b }) => {
            return (
              <TableRow
                key={`${base.date}__${base.symbol}`}
                className="align-top"
              >
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatIstDate(base.date)}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{base.symbol}</div>
                  {base.sector && (
                    <div className="text-muted-foreground text-xs">
                      {base.sector}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      'border-transparent',
                      base.direction === 'long'
                        ? 'bg-gain/10 text-gain'
                        : 'bg-loss/10 text-loss',
                    )}
                  >
                    {base.direction}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ArmResult trade={a} />
                </TableCell>
                <TableCell className="text-right">
                  <ArmResult trade={b} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ── session history strip ───────────────────────────────────────────────────
// Trading days newer than the last published replay, oldest-capped at 5. These
// sessions HAPPENED (or were holidays — indistinguishable) but their official
// record only lands at the next 4 AM run, so the grid logs them as pending
// instead of leaving a hole that reads like a bug.
function pendingSessionDates(lastPublished: string | null): string[] {
  if (!lastPublished) return []
  const out: string[] = []
  let d = previousTradingDay(istTodayKey())
  while (d > lastPublished && out.length < 5) {
    out.push(d)
    d = previousTradingDay(d)
  }
  return out
}

function PendingSessionCard({ date }: { date: string }) {
  return (
    <div className="ring-foreground/10 rounded-lg bg-amber-500/5 p-3 ring-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{formatIstDate(date)}</span>
        <Badge className="border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-500">
          pending
        </Badge>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        Replay publishes at the next 4 AM run — or market holiday.
      </p>
    </div>
  )
}

function RecentSessions({
  runs,
  pending,
}: {
  runs: IntradayRun[]
  pending: string[]
}) {
  if (runs.length === 0 && pending.length === 0) {
    return (
      <EmptyState
        title="No sessions yet"
        description="Sessions are listed here once the first replay publishes."
      />
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {pending.map((date) => (
        <PendingSessionCard key={date} date={date} />
      ))}
      {runs.map((run) => {
        const chosen =
          run.sectorTable?.find((r) => r.key === run.sector)?.name ?? run.sector
        return (
          <div
            key={run.date}
            className="bg-card ring-foreground/10 rounded-lg p-3 ring-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {formatIstDate(run.date)}
              </span>
              {runStatusBadge(run.status)}
            </div>
            <p className="text-muted-foreground mt-1 truncate text-xs">
              {chosen
                ? `${String(chosen).replace(/^NIFTY /, '')} · ${run.direction}`
                : (run.noTradeReason ?? '—')}
            </p>
            <p className="mt-1 text-xs tabular-nums">
              <span className={pnlCls(run.dayPnlA)}>
                A {formatCurrency(run.dayPnlA ?? 0)}
              </span>
              {' · '}
              <span className={pnlCls(run.dayPnlB)}>
                B {formatCurrency(run.dayPnlB ?? 0)}
              </span>
            </p>
          </div>
        )
      })}
    </div>
  )
}

export function IntradayTab({ data }: { data?: IntradayOverview | null }) {
  const summary = data?.summary ?? null
  const recentRuns = data?.recentRuns ?? []
  const recentTrades = data?.recentTrades ?? []
  const daily = data?.daily ?? []
  const latest = recentRuns[0] ?? null
  const pending = pendingSessionDates(latest?.date ?? null)
  const hasResults =
    recentRuns.length > 0 || (summary?.byArm.A.trades ?? 0) > 0

  if (!summary && !hasResults) {
    return (
      <EmptyState
        title="No sessions recorded yet"
        description="Once the intraday engine publishes its first session, your stat cards, equity curve and picks will appear here."
      />
    )
  }

  return (
    <div className="space-y-8">
      {summary && <IntradayStatCards summary={summary} />}

      {summary && (
        <section className="space-y-3">
          <SectionHeader
            title="Equity curve"
            hint="Running equity per exit by session"
          />
          {daily.length > 0 ? (
            <div className="bg-card ring-foreground/10 rounded-xl p-4 ring-1">
              <IntradayEquityChart daily={daily} />
            </div>
          ) : (
            <EmptyState
              title="No daily history yet"
              description="The equity curve appears after the first recorded session."
            />
          )}
        </section>
      )}

      {summary && (
        <section className="space-y-3">
          <SectionHeader title="By exit" hint="Closed trade stats per exit" />
          <ByExitTable summary={summary} />
        </section>
      )}

      {hasResults && (
        <>
          <section className="space-y-3">
            <SectionHeader
              title="Every pick"
              hint="One row per trade — both exits side by side"
            />
            <PicksTable trades={recentTrades} />
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Session history"
              hint="Every session — traded, no-trade and pending"
            />
            <RecentSessions runs={recentRuns} pending={pending} />
          </section>
        </>
      )}
    </div>
  )
}
