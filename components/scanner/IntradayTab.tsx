import { cn } from '@/lib/utils'
import { formatCurrency, formatIstDate, formatPercent } from '@/lib/format'
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
import { IntradayToday } from '@/components/scanner/IntradayToday'
import {
  SectorRankingTable,
  CandidateFunnel,
} from '@/components/scanner/IntradaySessionDetail'
import type {
  IntradayLiveDoc,
  IntradayOverview,
  IntradayRun,
  IntradayTrade,
} from '@/lib/scanner/types'

// ── Intraday tab — mirrors the Swing tab's section rhythm (Prem, 2026-07-15):
// Right now → stat cards → equity curve → by exit → last session → every pick →
// session history. No theory blocks anywhere; sessions not yet replayed are
// still LOGGED in the history grid as "pending" cards instead of silently
// missing (the 4 AM run publishes the previous session's official record).

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

// ── latest completed session, in full ───────────────────────────────────────
function LevelChip({
  label,
  value,
  cls,
}: {
  label: string
  value: string
  cls?: string
}) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className={cn('font-medium tabular-nums', cls)}>{value}</p>
    </div>
  )
}

function Tranches({ trade }: { trade: IntradayTrade }) {
  const trs = trade.tranches ?? []
  if (trs.length === 0) return null
  return (
    <span className="text-muted-foreground text-xs">
      {trs
        .map((t) => `${t.reason} ${t.qty}@${formatCurrency(t.price)} ${t.time}`)
        .join(' · ')}
    </span>
  )
}

function PickDetail({ armRows }: { armRows: IntradayTrade[] }) {
  const base = armRows[0]
  if (!base) return null
  const long = base.direction === 'long'
  const arms = ['A', 'B']
    .map((k) => armRows.find((r) => r.arm === k))
    .filter(Boolean) as IntradayTrade[]

  return (
    <div className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-base font-semibold">{base.symbol}</span>
        <Badge
          className={cn(
            'border-transparent',
            long ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss',
          )}
        >
          {base.direction}
        </Badge>
        {base.pct925 != null && (
          <span className={cn('text-xs tabular-nums', pnlCls(base.pct925))}>
            {formatPercent(base.pct925)} @ 9:25
          </span>
        )}
        {base.entryTime && (
          <span className="text-muted-foreground text-xs tabular-nums">
            entered {base.entryTime}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <LevelChip
          label="Entry"
          value={base.entry != null ? formatCurrency(base.entry) : '—'}
        />
        <LevelChip
          label="Stop"
          value={base.stop != null ? formatCurrency(base.stop) : '—'}
          cls="text-loss"
        />
        <LevelChip
          label="Shares"
          value={base.qty != null ? String(base.qty) : '—'}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {arms.map((a) => (
          <div key={a.id} className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                Exit {a.arm}{' '}
                <span className="text-muted-foreground text-xs">
                  {a.arm === 'A' ? '1.5× risk' : '2× risk'} · target{' '}
                  {a.target != null ? formatCurrency(a.target) : '—'}
                </span>
              </span>
              <Badge
                className={cn(
                  'border-transparent text-[10px]',
                  a.exitReason === 'TP'
                    ? 'bg-gain/10 text-gain'
                    : a.exitReason === 'SL'
                      ? 'bg-loss/10 text-loss'
                      : 'bg-secondary text-secondary-foreground',
                )}
              >
                {a.exitReason === 'TP'
                  ? 'target hit'
                  : a.exitReason === 'SL'
                    ? 'stopped out'
                    : (a.exitReason ?? '—')}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
              <Tranches trade={a} />
              <span
                className={cn('font-medium tabular-nums', pnlCls(a.netPnl))}
              >
                {a.netPnl != null ? formatCurrency(a.netPnl) : '—'}
                {a.rMultiple != null && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {a.rMultiple}R
                  </span>
                )}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 flex justify-between text-[11px] tabular-nums">
              <span>gross {formatCurrency(a.grossPnl)}</span>
              <span>costs {formatCurrency(a.costs)}</span>
            </div>
          </div>
        ))}
      </div>
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

function LatestReplay({
  run,
  trades,
}: {
  run: IntradayRun
  trades: IntradayTrade[]
}) {
  const dayTraded = trades.filter(
    (t) => t.date === run.date && t.status === 'TRADED',
  )
  // Group this day's arm rows by symbol so both exits sit under one pick.
  const bySymbol = new Map<string, IntradayTrade[]>()
  for (const t of dayTraded) {
    const arr = bySymbol.get(t.symbol) ?? []
    arr.push(t)
    bySymbol.set(t.symbol, arr)
  }
  const hasRanking = (run.sectorTable?.length ?? 0) > 0
  const hasFunnel = (run.picks?.length ?? 0) + (run.rejects?.length ?? 0) > 0
  const chosenName =
    run.sectorTable?.find((r) => r.key === run.sector)?.name ??
    run.sector ??
    null

  return (
    <div className="bg-card ring-foreground/10 space-y-4 rounded-xl p-5 ring-1 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{formatIstDate(run.date)}</h3>
          {runStatusBadge(run.status)}
        </div>
        <div className="flex items-center gap-3 text-sm tabular-nums">
          <span className={pnlCls(run.dayPnlA)}>
            A {formatCurrency(run.dayPnlA ?? 0)}
          </span>
          <span className={pnlCls(run.dayPnlB)}>
            B {formatCurrency(run.dayPnlB ?? 0)}
          </span>
        </div>
      </div>

      {run.status !== 'ok' && (
        <p className="text-muted-foreground text-sm">
          No trade —{' '}
          <span className="text-foreground">
            {run.noTradeReason ?? 'stood down'}
          </span>
        </p>
      )}

      {bySymbol.size > 0 && (
        <div className="space-y-3">
          {[...bySymbol.entries()].map(([symbol, armRows]) => (
            <PickDetail key={symbol} armRows={armRows} />
          ))}
        </div>
      )}

      {(hasRanking || hasFunnel) && (
        <details className="group border-t pt-3">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-xs font-medium">
            <span className="group-open:hidden">▸ </span>
            <span className="hidden group-open:inline">▾ </span>
            Why this pick — how the morning ranked
          </summary>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            {hasRanking && (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Sector ranking · 9:20 → 9:25
                </p>
                <SectorRankingTable
                  sectorTable={run.sectorTable!}
                  chosenKey={run.sector}
                  direction={run.direction}
                />
              </div>
            )}
            {hasFunnel && (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Candidate funnel
                </p>
                <CandidateFunnel
                  sectorName={chosenName}
                  direction={run.direction}
                  picks={run.picks ?? []}
                  rejects={run.rejects ?? []}
                />
              </div>
            )}
          </div>
        </details>
      )}

      {run.warnings && run.warnings.length > 0 && (
        <details className="border-t pt-3">
          <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
            Data warnings ({run.warnings.length})
          </summary>
          <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
            {run.warnings.map((w, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden>⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
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

export function IntradayTab({
  data,
  initialLive,
}: {
  data?: IntradayOverview | null
  initialLive: IntradayLiveDoc | null
}) {
  const summary = data?.summary ?? null
  const recentRuns = data?.recentRuns ?? []
  const recentTrades = data?.recentTrades ?? []
  const daily = data?.daily ?? []
  const latest = recentRuns[0] ?? null
  const pending = pendingSessionDates(latest?.date ?? null)
  const hasResults =
    recentRuns.length > 0 || (summary?.byArm.A.trades ?? 0) > 0

  return (
    <div className="space-y-8">
      <IntradayToday initialLive={initialLive} latestRun={latest} />

      {!hasResults && (
        <EmptyState
          title="No sessions recorded yet"
          description="Results appear after the first completed session."
        />
      )}

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

      {latest && (
        <section className="space-y-3">
          <SectionHeader
            title="Last completed session"
            hint="The evening replay is the official record"
          />
          <LatestReplay run={latest} trades={recentTrades} />
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
