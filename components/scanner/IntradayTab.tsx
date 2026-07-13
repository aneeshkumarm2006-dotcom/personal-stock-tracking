import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { formatCurrency, formatIstDate, formatPercent } from '@/lib/format'
import { SectionHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { IntradayLivePanel } from '@/components/scanner/IntradayLivePanel'
import {
  SectorRankingTable,
  CandidateFunnel,
} from '@/components/scanner/IntradaySessionDetail'
import type {
  IntradayOverview,
  IntradayRun,
  IntradayTrade,
} from '@/lib/scanner/types'

// ── Intraday tab — the video's sector-heatmap + VWAP ORB strategy, run VERBATIM
// (Prem's call 2026-07-11; the research RV filter is recorded as a diagnostic only,
// never a gate). The engine is a deterministic EOD replay (scanner/intraday/, via
// run_eod's intraday stage or run_intraday.py) and a live morning runner. The tab
// leads with what actually happened — live session, latest replay in full, arm
// scoreboard, every trade — and keeps the research/spec collapsed at the bottom.

function pnlCls(v: number | null | undefined) {
  if (v == null || v === 0) return 'text-muted-foreground'
  return v > 0 ? 'text-gain' : 'text-loss'
}

// ── plain-language orientation — the tab used to drop you cold into "Arm A /
// Arm B" with no idea what any of it meant. This card + glossary fixes that.
function IntradayIntro() {
  const terms: { term: string; def: ReactNode }[] = [
    {
      term: 'Arm A / Arm B',
      def: 'The same pick, exited two ways — A banks profit at 1.5× the risk, B holds out for 2×.',
    },
    {
      term: '9:25%',
      def: 'How far the stock had moved by 9:25 — the moment the pick is locked in.',
    },
    {
      term: 'RV',
      def: "Relative volume — today's opening volume vs its 14-day norm. Higher = more conviction.",
    },
    {
      term: 'R',
      def: 'One unit of risk (entry − stop). “+2R” means it made twice what it risked.',
    },
    {
      term: 'TP / SL',
      def: 'The trade closed on its Target (a win) or its Stop-loss (a loss).',
    },
  ]
  return (
    <div className="bg-muted/30 ring-foreground/10 space-y-3 rounded-xl p-5 ring-1 sm:p-6">
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">What you&apos;re looking at</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          A paper (pretend-money) forward test of one intraday strategy. Each
          morning it ranks NSE sectors, takes at most{' '}
          <span className="text-foreground font-medium">one stock</span> from
          the strongest sector, and enters on an early breakout. To settle which
          profit target works best, every pick is run twice at once —{' '}
          <span className="text-foreground font-medium">Arm A</span> takes
          profit at 1.5× the risk (safer, wins more often) and{' '}
          <span className="text-foreground font-medium">Arm B</span> holds out
          for 2× (greedier, bigger wins). Everything below is the running tally
          on ₹5,00,000 of pretend capital.
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

// ── cumulative per-arm scoreboard ───────────────────────────────────────────
function ArmCard({
  arm,
  target,
  blurb,
  ahead,
  stats,
}: {
  arm: string
  target: string
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
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Arm {arm}</p>
          {ahead && (
            <span className="bg-gain/10 text-gain rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
              ahead
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-xs">{target}</span>
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
                <span className="text-muted-foreground"> ({stats.winRate}%)</span>
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

// ── latest replay, in full ──────────────────────────────────────────────────
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
        {base.rv != null && (
          <span className="text-muted-foreground text-xs tabular-nums">
            RV {base.rv}×
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
          label="Qty"
          value={base.qty != null ? String(base.qty) : '—'}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {arms.map((a) => (
          <div key={a.id} className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                Arm {a.arm}{' '}
                <span className="text-muted-foreground text-xs">
                  {a.arm === 'A' ? '1:1.5' : '1:2'} · target{' '}
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
                {a.exitReason ?? '—'}
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

function statusBadge(status: string) {
  const cls =
    status === 'ok'
      ? 'bg-gain/10 text-gain'
      : status === 'failed'
        ? 'bg-loss/10 text-loss'
        : 'bg-muted text-muted-foreground'
  return <Badge className={cn('border-transparent', cls)}>{status}</Badge>
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
  // Group this day's arm rows by symbol so both arms sit under one pick.
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
          <h3 className="text-base font-semibold">
            Latest replay · {formatIstDate(run.date)}
          </h3>
          {statusBadge(run.status)}
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

// ── every pick — one row per trade, both exit arms side by side ──────────────
// (The old table put each pick on TWO rows — one per arm — across 17 columns that
// only fit with a horizontal scroll. Merging the arms halves the rows and the
// width and makes the A-vs-B comparison read straight across.)
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
          {trade.exitReason ?? '—'}
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
        description="Once a session triggers a pick, it appears here with both exit arms side by side."
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
            <th className={th}>Dir</th>
            <th className={thr}>Arm A · 1:1.5</th>
            <th className={thr}>Arm B · 1:2</th>
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

// ── recent sessions strip ───────────────────────────────────────────────────
function RecentSessions({ runs }: { runs: IntradayRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No sessions yet"
        description="Each evening run replays the completed session and lists it here."
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
              <Badge
                className={cn(
                  'border-transparent',
                  run.status === 'ok'
                    ? 'bg-gain/10 text-gain'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {run.status}
              </Badge>
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

// One-line, plain-language read on which arm is winning and whether to trust it.
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
        'Both arms are dead even so far.'
      ) : (
        <>
          <span className="text-foreground font-medium">Arm {leader}</span> is
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

function IntradayResults({ data }: { data: IntradayOverview }) {
  const { summary, recentRuns, recentTrades } = data
  const latest = recentRuns[0]
  const leaderArm =
    summary && Math.max(summary.byArm.A.trades, summary.byArm.B.trades) > 0
      ? summary.byArm.B.netPnl > summary.byArm.A.netPnl
        ? 'B'
        : summary.byArm.A.netPnl > summary.byArm.B.netPnl
          ? 'A'
          : null
      : null
  return (
    <div className="space-y-6">
      {summary && (
        <section className="space-y-3">
          <SectionHeader
            title="Scoreboard — which exit target is winning"
            hint={`Running total on ${formatCurrency(summary.capital)} of pretend capital`}
          />
          <ArmVerdict summary={summary} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ArmCard
              arm="A"
              target="target 1:1.5"
              blurb="Banks profit at 1.5× the risk — safer, wins more often."
              ahead={leaderArm === 'A'}
              stats={summary.byArm.A}
            />
            <ArmCard
              arm="B"
              target="target 1:2"
              blurb="Holds out for 2× the risk — greedier, bigger wins."
              ahead={leaderArm === 'B'}
              stats={summary.byArm.B}
            />
          </div>
        </section>
      )}

      {latest && <LatestReplay run={latest} trades={recentTrades} />}

      <section className="space-y-3">
        <SectionHeader
          title="Every pick"
          hint="One row per trade — both exit arms side by side"
        />
        <PicksTable trades={recentTrades} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Session history"
          hint="Every morning the engine ran — including no-trade days"
        />
        <RecentSessions runs={recentRuns} />
      </section>
    </div>
  )
}

// ── collapsed reference: strategy spec, evidence, checklist, sources ─────────
type EvidenceStat = { headline: string; body: ReactNode }

const evidence: EvidenceStat[] = [
  {
    headline: 'Relative volume is the edge',
    body: (
      <>
        Zarattini/Barbon/Aziz (2024): a plain 5-min ORB on US stocks was barely
        profitable (Sharpe <span className="tabular-nums">0.48</span>); the same
        system restricted to the top-20 stocks by opening-range relative volume
        hit Sharpe <span className="tabular-nums">2.81</span>. Expectancy is{' '}
        <span className="font-medium">negative below RV 1.0</span> and rises
        with RV.
      </>
    ),
  },
  {
    headline: '5-min range beats 15/30/60',
    body: (
      <>
        Under identical filtering, the 5-minute opening range decisively
        outperformed longer ranges (Sharpe{' '}
        <span className="tabular-nums">2.81 / 1.43 / 0.21 / 0.40</span>). The
        video&apos;s 9:15–9:20 candle is the right range — keep it.
      </>
    ),
  },
  {
    headline: 'Payoff asymmetry, not accuracy',
    body: (
      <>
        The companion QQQ study won only ~
        <span className="tabular-nums">24%</span> of trades — expectancy came
        from letting winners run (10R target or end-of-day exit, ~
        <span className="tabular-nums">0.13–0.18R</span>/trade). The
        video&apos;s tight 1:1.5–2 targets may trade away the right tail —{' '}
        <span className="font-medium">
          the forward test measures exactly that
        </span>
        .
      </>
    ),
  },
  {
    headline: 'Costs kill the unfiltered version',
    body: (
      <>
        A 2026 falsification study (MNQ futures) found every unfiltered ORB
        variant went negative after realistic round-trip costs. The edge — if it
        transfers to NSE at all — lives in the{' '}
        <span className="font-medium">selection layer plus honest costs</span>,
        which is exactly what the paper engine measures.
      </>
    ),
  },
]

type QualityFilter = {
  name: string
  rule: ReactNode
  why: ReactNode
  data: string
}

const filters: QualityFilter[] = [
  {
    name: 'Leading sector',
    rule: (
      <>
        At 9:20, rank NSE sectoral indices by % change vs previous close; the
        top mover (either direction) must still lead at 9:25.
      </>
    ),
    why: (
      <>
        Sector momentum picks the pond. The 9:25 re-check rejects one-candle
        head fakes without adding discretion.
      </>
    ),
    data: 'index 5-min candles (Angel)',
  },
  {
    name: 'Leader within the sector',
    rule: (
      <>
        Candidates = constituents of the leading sector ranked by % change at
        9:25, direction matching the sector move.
      </>
    ),
    why: (
      <>
        The original setup&apos;s core: trade the stock dragging the sector, not
        a sympathy name drifting with it.
      </>
    ),
    data: 'NSE index constituents + candles',
  },
  {
    name: 'The top mover takes the trade',
    rule: (
      <>
        The single top gainer/loser by % change at 9:25 is the pick — exactly
        the video&apos;s rule. Opening-range relative volume (first-5-min volume
        ÷ its 14-day average) is{' '}
        <span className="font-medium">
          recorded on every trade as a diagnostic
        </span>
        , but never picks or rejects.
      </>
    ),
    why: (
      <>
        Research says RV is the highest-leverage ORB filter — so we log it on
        every trade. If the forward test struggles, the recorded RVs tell us
        whether the filter would have saved it.
      </>
    ),
    data: 'pct change rank · RV logged',
  },
  {
    name: 'Right side of VWAP',
    rule: (
      <>
        Session VWAP from 9:15 (cumulative (H+L+C)/3 × volume). Longs only if
        the 9:15–9:20 close is above VWAP; shorts only below.
      </>
    ),
    why: (
      <>
        Validated as a momentum filter, not mean-reversion — no VWAP-fade
        entries in this strategy.
      </>
    ),
    data: 'computed from 5-min candles',
  },
  {
    name: 'No doji first candle',
    rule: (
      <>
        Skip if the 9:15–9:20 candle&apos;s |close − open| is under ~
        <span className="tabular-nums">10%</span> of its high−low range.
      </>
    ),
    why: (
      <>
        The ORB papers exclude direction-less first candles — there is no range
        conviction to break.
      </>
    ),
    data: 'first-candle OHLC',
  },
  {
    name: 'Not on the F&O ban list',
    rule: (
      <>
        Drop any candidate on NSE&apos;s daily security ban list (fo_secban.csv)
        for the trade date.
      </>
    ),
    why: (
      <>
        Ban-period names trade under position restrictions with distorted
        intraday behaviour.
      </>
    ),
    data: 'nse_files.py fetch',
  },
  {
    name: 'Tradeable series only',
    rule: (
      <>
        EQ series, no ASM/GSM stage ≥ 2, no T2T (-BE/-BZ), and a 5%+ circuit
        band — same safety gates as the swing universe.
      </>
    ),
    why: (
      <>
        Intraday (MIS) is blocked or distorted in T2T and tight-circuit names; a
        2% band can pin the stock before the target.
      </>
    ),
    data: 'universe.py + surveillance capture',
  },
]

const failureModes: string[] = [
  'Doji or VWAP-mismatched first candle on the top mover — no substitute is taken',
  'Same-candle SL and target touch — resolved as SL, the conservative tie-break',
  'Sector leadership flips between 9:20 and 9:25 — one-candle head fake',
  'Trigger gaps: next candle opens beyond the entry level — skip, never chase the fill',
  'No trigger by 10:30 — the opening impulse is spent; stand down for the day',
  'F&O ban list, ASM/GSM ≥ 2, T2T series, or a 2–5% circuit band pinning the move',
]

const sources: { label: string; href: string }[] = [
  {
    label: 'Zarattini, Barbon & Aziz — Stocks in Play (5-min ORB + RV)',
    href: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4729284',
  },
  {
    label: 'Zarattini & Aziz — ORB on QQQ',
    href: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4416622',
  },
  {
    label: 'Zarattini & Aziz — VWAP as a momentum signal',
    href: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4631351',
  },
  {
    label: 'ORB falsification study on MNQ futures (costs)',
    href: 'https://arxiv.org/pdf/2605.04004',
  },
  {
    label: 'NSE — daily F&O security ban list (CSV)',
    href: 'https://nsearchives.nseindia.com/content/fo/fo_secban.csv',
  },
  {
    label: 'Zerodha — charge sheet used for the cost model',
    href: 'https://zerodha.com/charges/',
  },
]

function StrategyReference() {
  const rules: { label: string; body: ReactNode }[] = [
    {
      label: 'Signal',
      body: (
        <>
          Leading sector at 9:20/9:25 → its top gainer/loser by % change → entry
          on a break of the 9:15–9:20 candle&apos;s{' '}
          <span className="font-medium">high (long) / low (short)</span>, taken
          only on the matching side of session VWAP.
        </>
      ),
    },
    {
      label: 'Exit',
      body: (
        <>
          Stop at the opposite extreme of the 9:15–9:20 candle. Two arms run in
          parallel — fixed <span className="tabular-nums">1:1.5</span> vs fixed{' '}
          <span className="tabular-nums">1:2</span>. Time exit 15:15 either way.
        </>
      ),
    },
    {
      label: 'Horizon',
      body: (
        <>
          Strictly intraday — entered after 9:25, flat by 15:15. Replayed
          deterministically in the evening run from 5-min candles.
        </>
      ),
    },
    {
      label: 'Universe',
      body: (
        <>
          Constituents of NSE sectoral indices, filtered by the same safety
          gates as the swing scanner, minus ban-list names.
        </>
      ),
    },
  ]

  return (
    <details className="bg-card ring-foreground/10 group rounded-xl ring-1">
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            Strategy, evidence &amp; full checklist
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            The rules the engine runs, the research behind them, and every
            qualifying gate — reference material, collapsed by default.
          </p>
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">
          <span className="group-open:hidden">show ▾</span>
          <span className="hidden group-open:inline">hide ▴</span>
        </span>
      </summary>

      <div className="space-y-6 border-t p-5 sm:p-6">
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

        <div>
          <SectionHeader
            title="What the record says"
            hint="Verified ORB / VWAP studies — all US-market; NSE transfer is what the forward test measures"
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {evidence.map((e) => (
              <div key={e.headline} className="space-y-1">
                <p className="text-sm font-semibold">{e.headline}</p>
                <p className="text-muted-foreground text-sm">{e.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader
            title="Qualifying a pick — the checklist"
            hint="All filters must pass; every rule is deterministic and clock-pinned"
          />
          <ol className="mt-4 space-y-4">
            {filters.map((f, i) => (
              <li key={f.name} className="flex gap-3">
                <span
                  className="text-muted-foreground mt-0.5 shrink-0 text-xs font-semibold tabular-nums"
                  aria-hidden
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{f.name}</p>
                    <span className="bg-gain/10 text-gain inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                      <span aria-hidden>✓</span>
                      {f.data}
                    </span>
                  </div>
                  <p className="text-sm">{f.rule}</p>
                  <p className="text-muted-foreground text-sm">{f.why}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <SectionHeader
            title="Auto-reject list"
            hint="The documented ways this setup fails"
          />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {failureModes.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <span
                  className="text-loss mt-0.5 shrink-0 font-medium"
                  aria-hidden
                >
                  ✗
                </span>
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground border-t pt-3 text-xs">
          Research sources:{' '}
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

export function IntradayTab({ data }: { data?: IntradayOverview | null }) {
  const hasResults =
    !!data &&
    (data.recentRuns.length > 0 || (data.summary?.byArm.A.trades ?? 0) > 0)

  return (
    <div className="space-y-6">
      <IntradayLivePanel />
      <IntradayIntro />

      {data && hasResults && <IntradayResults data={data} />}
      {data && !hasResults && (
        <EmptyState
          title="Forward test armed — no sessions replayed yet"
          description="The evening run replays each completed session (or run `python run_intraday.py` manually). Results appear here; expand the reference below for the rules the engine executes."
        />
      )}

      <StrategyReference />
    </div>
  )
}
