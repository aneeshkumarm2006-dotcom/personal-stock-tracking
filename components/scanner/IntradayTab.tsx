import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { formatCurrency, formatIstDate, formatPercent } from '@/lib/format'
import { SectionHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
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

// ── Intraday tab — status-first, decision-first (Prem's 2026-07-14 redesign).
// Order: Right now (is it running + today's decision) → is it making money →
// last completed session → every pick → history. ALL theory lives in one small
// collapsed block at the bottom; the long research essay is gone.

function pnlCls(v: number | null | undefined) {
  if (v == null || v === 0) return 'text-muted-foreground'
  return v > 0 ? 'text-gain' : 'text-loss'
}

// ── cumulative per-arm scoreboard ───────────────────────────────────────────
function ArmCard({
  arm,
  blurb,
  ahead,
  stats,
}: {
  arm: string
  blurb: string
  ahead?: boolean
  stats: NonNullable<IntradayOverview['summary']>['byArm']['A']
}) {
  return (
    <div
      className={cn(
        'bg-card ring-foreground/10 rounded-xl p-4 ring-1',
        ahead && 'ring-gain/40 ring-2',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Exit {arm}</p>
        {ahead && (
          <span className="bg-gain/10 text-gain rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
            winning
          </span>
        )}
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{blurb}</p>
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-muted-foreground text-xs">Net profit / loss</p>
          <p
            className={cn(
              'text-xl font-semibold tabular-nums',
              pnlCls(stats.netPnl),
            )}
          >
            {formatCurrency(stats.netPnl)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Trades · wins</p>
            <p className="tabular-nums">
              {stats.trades} · {stats.wins}
              {stats.winRate != null && (
                <span className="text-muted-foreground">
                  {' '}
                  ({stats.winRate}%)
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Avg R</p>
            <p className={cn('tabular-nums', pnlCls(stats.avgR))}>
              {stats.avgR != null ? `${stats.avgR}R` : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// One-line, plain-language read on which exit is winning and whether to trust it.
function ArmVerdict({
  summary,
}: {
  summary: NonNullable<IntradayOverview['summary']>
}) {
  const a = summary.byArm.A
  const b = summary.byArm.B
  const trades = Math.max(a.trades, b.trades)
  if (trades === 0) return null
  const diff = b.netPnl - a.netPnl
  const leader = diff > 0 ? 'B' : diff < 0 ? 'A' : null
  return (
    <p className="text-muted-foreground text-sm">
      {leader == null ? (
        'Both exits are dead even so far.'
      ) : (
        <>
          <span className="text-foreground font-medium">Exit {leader}</span> is
          ahead by {formatCurrency(Math.abs(diff))} —{' '}
          {leader === 'B'
            ? 'holding for the bigger target'
            : 'banking profit early'}{' '}
          has paid off so far.
        </>
      )}
      {trades < 10 && (
        <>
          {' '}
          Only {trades} trade{trades === 1 ? '' : 's'} in, though — far too few
          to trust yet.
        </>
      )}
    </p>
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
          . The ranking and funnel below show exactly why.
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
  const th = 'px-3 py-2 font-medium'
  const thr = 'px-3 py-2 text-right font-medium'
  return (
    <div className="bg-card ring-foreground/10 overflow-x-auto rounded-xl ring-1">
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className={th}>Date</th>
            <th className={th}>Stock</th>
            <th className={th}>Side</th>
            <th className={thr}>Exit A · 1.5×</th>
            <th className={thr}>Exit B · 2×</th>
          </tr>
        </thead>
        <tbody>
          {picks.map(({ base, a, b }) => {
            return (
              <tr
                key={`${base.date}__${base.symbol}`}
                className="border-b align-top last:border-0"
              >
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {formatIstDate(base.date)}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{base.symbol}</div>
                  {base.sector && (
                    <div className="text-muted-foreground text-xs">
                      {base.sector}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
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
                </td>
                <td className="px-3 py-2 text-right">
                  <ArmResult trade={a} />
                </td>
                <td className="px-3 py-2 text-right">
                  <ArmResult trade={b} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── session history strip ───────────────────────────────────────────────────
function RecentSessions({ runs }: { runs: IntradayRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No sessions yet"
        description="Each completed session is replayed in the evening and listed here."
      />
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

// ── the ONLY theory on the tab — one compact collapsed block at the bottom ───
function IntradayHowItWorks() {
  const rules: { label: string; body: ReactNode }[] = [
    {
      label: 'The pick',
      body: 'At 9:20 and again at 9:25, every NSE sector is ranked by % change. The strongest sector’s single top mover is the pick — long if it’s up, short if it’s down. One pick per day, maximum.',
    },
    {
      label: 'The entry',
      body: 'Enter when the price breaks the first 5-minute candle’s high (long) or low (short), and only on the matching side of VWAP. If price gaps through the level, skip — never chase.',
    },
    {
      label: 'The two exits',
      body: 'Stop-loss at the other end of that first candle. Every pick is run through two exits at once: Exit A books profit at 1.5× the risk, Exit B holds for 2×. Anything still open closes at 15:15. Comparing A vs B over many trades is the whole experiment.',
    },
    {
      label: 'Auto-skip',
      body: 'Doji first candle, wrong side of VWAP, stock on the F&O ban list or under NSE surveillance, or no trigger by 10:30 — any of these means a deliberate no-trade day.',
    },
  ]
  const terms: { term: string; def: string }[] = [
    {
      term: 'Exit A / Exit B',
      def: 'The same trade closed two ways — A banks profit at 1.5× the risk, B holds out for 2×.',
    },
    {
      term: '9:25%',
      def: 'How far the stock had moved by 9:25, the moment the pick is locked in.',
    },
    {
      term: 'R',
      def: 'One unit of risk (entry − stop). “+2R” means it made twice what it risked.',
    },
    {
      term: 'RV',
      def: 'Relative volume — the opening volume vs its 14-day norm. Recorded for research, never used to pick.',
    },
    {
      term: 'Target / stop',
      def: 'A trade ends at its profit target (a win) or its stop-loss (a loss).',
    },
  ]
  const sources: { label: string; href: string }[] = [
    {
      label: 'Stocks in Play — 5-min ORB study',
      href: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4729284',
    },
    {
      label: 'ORB on QQQ',
      href: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4416622',
    },
    {
      label: 'VWAP as a momentum signal',
      href: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4631351',
    },
    {
      label: 'Zerodha charges (cost model)',
      href: 'https://zerodha.com/charges/',
    },
  ]

  return (
    <details className="bg-card ring-foreground/10 group rounded-xl ring-1">
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            How this test works — rules &amp; key terms
          </h3>
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">
          <span className="group-open:hidden">show ▾</span>
          <span className="hidden group-open:inline">hide ▴</span>
        </span>
      </summary>

      <div className="space-y-5 border-t p-4 sm:p-5">
        <p className="text-muted-foreground text-sm leading-relaxed">
          A paper (pretend-money) forward test on ₹5,00,000: one simple intraday
          strategy from a trading video, run exactly as stated, every trading
          day — to find out whether it actually makes money after real costs.
          No real money is at risk.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {rules.map((r) => (
            <div key={r.label} className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {r.label}
              </p>
              <p className="text-sm">{r.body}</p>
            </div>
          ))}
        </div>

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

        <p className="text-muted-foreground border-t pt-3 text-xs">
          Research behind the setup:{' '}
          {sources.map((s, i) => (
            <span key={s.href}>
              {i > 0 && ' · '}
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground underline underline-offset-2"
              >
                {s.label}
              </a>
            </span>
          ))}
        </p>
      </div>
    </details>
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
  const latest = recentRuns[0] ?? null
  const hasResults =
    recentRuns.length > 0 || (summary?.byArm.A.trades ?? 0) > 0
  const leaderArm =
    summary && Math.max(summary.byArm.A.trades, summary.byArm.B.trades) > 0
      ? summary.byArm.B.netPnl > summary.byArm.A.netPnl
        ? 'B'
        : summary.byArm.A.netPnl > summary.byArm.B.netPnl
          ? 'A'
          : null
      : null

  return (
    <div className="space-y-8">
      <IntradayToday initialLive={initialLive} latestRun={latest} />

      {!hasResults && (
        <EmptyState
          title="No sessions recorded yet"
          description="Each completed trading day is replayed in the evening; the results land here. One pick per day, paper-traded with two exits at once."
        />
      )}

      {summary && (
        <section className="space-y-3">
          <SectionHeader
            title="Is it making money?"
            hint={`running total on ${formatCurrency(summary.capital)} of pretend capital`}
          />
          <ArmVerdict summary={summary} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ArmCard
              arm="A"
              blurb="Books profit at 1.5× the risk — safer, wins more often."
              ahead={leaderArm === 'A'}
              stats={summary.byArm.A}
            />
            <ArmCard
              arm="B"
              blurb="Holds out for 2× the risk — greedier, bigger wins."
              ahead={leaderArm === 'B'}
              stats={summary.byArm.B}
            />
          </div>
        </section>
      )}

      {latest && (
        <section className="space-y-3">
          <SectionHeader
            title="Last completed session"
            hint="the evening replay is the official record"
          />
          <LatestReplay run={latest} trades={recentTrades} />
        </section>
      )}

      {hasResults && (
        <>
          <section className="space-y-3">
            <SectionHeader
              title="Every pick"
              hint="one row per trade — both exits side by side"
            />
            <PicksTable trades={recentTrades} />
          </section>

          <section className="space-y-3">
            <SectionHeader
              title="Session history"
              hint="every morning the engine ran — including no-trade days"
            />
            <RecentSessions runs={recentRuns} />
          </section>
        </>
      )}

      <IntradayHowItWorks />
    </div>
  )
}
