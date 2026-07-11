import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { formatCurrency, formatIstDate } from '@/lib/format'
import { SectionHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { IntradayLivePanel } from '@/components/scanner/IntradayLivePanel'
import type { IntradayOverview, IntradayTrade } from '@/lib/scanner/types'

// ── Intraday tab — the video's sector-heatmap + VWAP ORB strategy, run VERBATIM
// (Prem's call 2026-07-11; the research RV filter is recorded as a diagnostic only,
// never a gate). The engine is a deterministic EOD replay (scanner/intraday/, via
// run_eod's intraday stage or run_intraday.py): decisions are clock-pinned (9:20/9:25,
// 09:15-bar breakout), so the whole day reconstructs from 5-min candles after close
// — no live morning process. Results render above; the research-backed spec below
// stays as the design document (sources at the bottom, 2026-07-11 research pass).

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
        <span className="tabular-nums">0.13–0.18R</span>/trade). The video&apos;s
        tight 1:1.5–2 targets may trade away the right tail —{' '}
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
  data: { ready: boolean; label: string }
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
    data: { ready: true, label: 'index 5-min candles (Angel)' },
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
    data: { ready: true, label: 'NSE index constituents + candles' },
  },
  {
    name: 'The top mover takes the trade',
    rule: (
      <>
        The single top gainer/loser by % change at 9:25 is the pick — exactly
        the video's rule. Opening-range relative volume (first-5-min volume ÷
        its 14-day average) is <span className="font-medium">recorded on every
        trade as a diagnostic</span>, but never picks or rejects.
      </>
    ),
    why: (
      <>
        Research says RV is the highest-leverage ORB filter — so we log it on
        every trade. If the forward test struggles, the recorded RVs tell us
        whether the filter would have saved it.
      </>
    ),
    data: { ready: true, label: 'pct change rank · RV logged' },
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
    data: { ready: true, label: 'computed from 5-min candles' },
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
    data: { ready: true, label: 'first-candle OHLC' },
  },
  {
    name: 'Not on the F&O ban list',
    rule: (
      <>
        Drop any candidate on NSE&apos;s daily security ban list
        (fo_secban.csv) for the trade date.
      </>
    ),
    why: (
      <>
        Ban-period names trade under position restrictions with distorted
        intraday behaviour.
      </>
    ),
    data: { ready: true, label: 'nse_files.py fetch (standing)' },
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
        Intraday (MIS) is blocked or distorted in T2T and tight-circuit names;
        a 2% band can pin the stock before the target.
      </>
    ),
    data: { ready: true, label: 'universe.py + surveillance capture' },
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

function ReadyChip({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        ready ? 'bg-gain/10 text-gain' : 'bg-muted text-muted-foreground'
      )}
    >
      <span aria-hidden>{ready ? '✓' : '○'}</span>
      {label}
    </span>
  )
}

function pnlCls(v: number | null | undefined) {
  if (v == null || v === 0) return 'text-muted-foreground'
  return v > 0 ? 'text-gain' : 'text-loss'
}

function ArmCard({
  arm,
  label,
  stats,
}: {
  arm: string
  label: string
  stats: NonNullable<IntradayOverview['summary']>['byArm']['A']
}) {
  return (
    <div className="bg-card ring-foreground/10 rounded-xl p-4 ring-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Arm {arm}</p>
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Net P&amp;L</p>
          <p className={cn('font-medium tabular-nums', pnlCls(stats.netPnl))}>
            {formatCurrency(stats.netPnl)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Equity</p>
          <p className="font-medium tabular-nums">{formatCurrency(stats.equity)}</p>
        </div>
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
  )
}

function TradesTable({ trades }: { trades: IntradayTrade[] }) {
  const traded = trades.filter((t) => t.status === 'TRADED')
  if (traded.length === 0) {
    return (
      <EmptyState
        title="No trades yet"
        description="Replayed trades will appear here after the first session with a triggered pick."
      />
    )
  }
  return (
    <div className="bg-card ring-foreground/10 overflow-x-auto rounded-xl ring-1">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Symbol</th>
            <th className="px-3 py-2 font-medium">Dir</th>
            <th className="px-3 py-2 font-medium">Arm</th>
            <th className="px-3 py-2 text-right font-medium">RV</th>
            <th className="px-3 py-2 text-right font-medium">Entry</th>
            <th className="px-3 py-2 text-right font-medium">Exit</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 text-right font-medium">Net P&amp;L</th>
            <th className="px-3 py-2 text-right font-medium">R</th>
          </tr>
        </thead>
        <tbody>
          {traded.map((t) => (
            <tr key={t.id} className="border-b last:border-0">
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                {formatIstDate(t.date)}
              </td>
              <td className="px-3 py-2 font-medium">{t.symbol}</td>
              <td className="px-3 py-2">
                <Badge
                  className={cn(
                    'border-transparent',
                    t.direction === 'long'
                      ? 'bg-gain/10 text-gain'
                      : 'bg-loss/10 text-loss',
                  )}
                >
                  {t.direction}
                </Badge>
              </td>
              <td className="px-3 py-2 tabular-nums">{t.arm}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {t.rv != null ? `${t.rv}×` : '—'}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {t.entry != null ? formatCurrency(t.entry) : '—'}
                {t.entryTime && (
                  <span className="text-muted-foreground text-xs"> {t.entryTime}</span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {(() => {
                  const last = t.tranches?.[t.tranches.length - 1]
                  return last ? formatCurrency(last.price) : '—'
                })()}
                {t.exitTime && (
                  <span className="text-muted-foreground text-xs"> {t.exitTime}</span>
                )}
              </td>
              <td className="px-3 py-2">{t.exitReason ?? '—'}</td>
              <td
                className={cn(
                  'px-3 py-2 text-right font-medium tabular-nums',
                  pnlCls(t.netPnl),
                )}
              >
                {t.netPnl != null ? formatCurrency(t.netPnl) : '—'}
              </td>
              <td className={cn('px-3 py-2 text-right tabular-nums', pnlCls(t.rMultiple))}>
                {t.rMultiple != null ? `${t.rMultiple}R` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IntradayResults({ data }: { data: IntradayOverview }) {
  const { summary, recentRuns, recentTrades } = data
  return (
    <div className="space-y-6">
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ArmCard arm="A" label="fixed 1:1.5 target" stats={summary.byArm.A} />
          <ArmCard arm="B" label="fixed 1:2 target" stats={summary.byArm.B} />
        </div>
      ) : (
        <EmptyState
          title="No replays yet"
          description="Per-arm stats appear after the first published session replay."
        />
      )}

      <section className="space-y-3">
        <SectionHeader
          title="Trades"
          hint="Both exit arms per pick — the A/B test that settles the target debate"
        />
        <TradesTable trades={recentTrades} />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Recent sessions" hint="Latest intraday replays" />
        {recentRuns.length === 0 ? (
          <EmptyState
            title="No sessions yet"
            description="Each evening run replays the completed session and lists it here."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {recentRuns.map((run) => (
              <div
                key={run.date}
                className="bg-card ring-foreground/10 rounded-lg p-3 ring-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{formatIstDate(run.date)}</span>
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
                <p className="text-muted-foreground mt-1 text-xs">
                  {run.sector ? `${run.sector} · ${run.direction}` : (run.noTradeReason ?? '—')}
                </p>
                <p className="mt-1 text-xs tabular-nums">
                  <span className={pnlCls(run.dayPnlA)}>A {formatCurrency(run.dayPnlA ?? 0)}</span>
                  {' · '}
                  <span className={pnlCls(run.dayPnlB)}>B {formatCurrency(run.dayPnlB ?? 0)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function IntradayTab({ data }: { data?: IntradayOverview | null }) {
  const hasResults =
    !!data && (data.recentRuns.length > 0 || (data.summary?.byArm.A.trades ?? 0) > 0)
  const rules: { label: string; body: ReactNode }[] = [
    {
      label: 'Signal',
      body: (
        <>
          Leading sector at 9:20/9:25 → its top gainer/loser by % change → entry
          on a break of the 9:15–9:20 candle&apos;s{' '}
          <span className="font-medium">high (long) / low (short)</span>, taken
          only on the matching side of session VWAP — the video&apos;s rules,
          verbatim.
        </>
      ),
    },
    {
      label: 'Exit',
      body: (
        <>
          Stop at the opposite extreme of the 9:15–9:20 candle. Two arms run in
          parallel — the video&apos;s two stated targets: fixed{' '}
          <span className="tabular-nums">1:1.5</span> vs fixed{' '}
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

  const readiness: { ready: boolean; text: string }[] = [
    {
      ready: true,
      text: '5-min candle store + Angel FIVE_MINUTE fetch (intraday/candles5m.py) — rolling RV history in DuckDB, idempotent upserts',
    },
    {
      ready: true,
      text: 'Sector registry + niftyindices constituent CSVs with last-good fallback (intraday/sectors.py); constituent-proxy ranking for the 3 sectors Angel carries no index for',
    },
    {
      ready: true,
      text: 'Cost model verified (2026-07-11): brokerage min(0.1%, ₹20, floor ₹5)/order · STT 0.025% sell leg (the entry leg of shorts) · NSE txn 0.00307%/leg · SEBI ₹10/cr · 18% GST · stamp 0.003% buy leg · slippage on stop fills (intraday/costs.py)',
    },
    {
      ready: true,
      text: 'Replay engine (intraday/engine.py) — sector rank 9:20/9:25, top-mover pick (RV logged, not gating), VWAP side, doji + gap-through skips, arms 1:1.5 / 1:2, SL-first tie-break',
    },
    {
      ready: true,
      text: 'Files-first publish (intraday/publishing.py → scannerIntradayRuns/Trades/Stats) + run_eod intraday stage replaying the last completed session each morning',
    },
    {
      ready: false,
      text: 'Open questions the forward test must answer: does the raw video setup carry an edge net of costs, and would the shelved research filters (RV gate, trail exits) have improved it — the logged diagnostics keep both answerable',
    },
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

  return (
    <div className="space-y-6">
      <IntradayLivePanel />
      {data && hasResults && <IntradayResults data={data} />}
      {data && !hasResults && (
        <EmptyState
          title="Forward test armed — no sessions replayed yet"
          description="The evening run replays each completed session (or run `python run_intraday.py` manually). Results appear here; the spec below is what the engine executes."
        />
      )}

      <div className="bg-card ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">
              Sector Momentum · VWAP ORB (5-min)
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              The NSE-heatmap opening play, exactly as traded in the video: the
              leading sector picks the pond, its top gainer/loser is the trade,
              the opening-range break times the entry — and the paper engine
              proves whether it survives real costs.
            </p>
          </div>
          <Badge className="bg-secondary text-secondary-foreground shrink-0 border-transparent">
            Forward test · deterministic replay
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
        <p className="mt-4 text-sm">
          Takeaway: the research above says a naked opening-range break has{' '}
          <span className="font-medium">no reliable edge net of costs</span>, and
          that RV filtering is what rescued it in the US studies. This forward
          test runs the video&apos;s rules verbatim anyway — that is the question
          being asked — while logging RV on every trade, so if the record
          disappoints, the data to test the research filters is already in hand.
        </p>
      </div>

      <div className="bg-card ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
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
                  <ReadyChip ready={f.data.ready} label={f.data.label} />
                </div>
                <p className="text-sm">{f.rule}</p>
                <p className="text-muted-foreground text-sm">{f.why}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-card ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
        <SectionHeader
          title="Entry & exit design"
          hint="Stop-order break entry; two exit arms decide the target debate"
        />
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Entry
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <span className="font-medium">Trigger</span>: stop-order at the
                9:15–9:20 candle&apos;s high (long) / low (short), armed from
                9:25, valid until 10:30. Untriggered = no trade.
              </li>
              <li>
                <span className="font-medium">No chasing</span>: if a candle
                gaps through the trigger, the pick is skipped — the replay fills
                only at the level or better, mirroring the swing engine&apos;s
                gap rule.
              </li>
              <li>
                <span className="font-medium">Initial stop</span> at the
                opposite extreme of the 9:15–9:20 candle; qty from the same{' '}
                <span className="tabular-nums">
                  Capital × Risk% ÷ (Buy − SL)
                </span>{' '}
                formula.
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Exit ladder
            </p>
            <ul className="space-y-2 text-sm">
              <li>
                <span className="font-medium">Arm A</span>: fixed target at{' '}
                <span className="tabular-nums">1:1.5</span>, stop unchanged —
                the video&apos;s first stated target.
              </li>
              <li>
                <span className="font-medium">Arm B</span>: fixed target at{' '}
                <span className="tabular-nums">1:2</span>, stop unchanged — the
                video&apos;s second target. Same entry, so the pair measures
                which target the setup actually supports.
              </li>
              <li>
                <span className="font-medium">Time exit 15:15</span> for
                whatever remains, both arms — nothing is carried overnight.
              </li>
              <li>
                Same-candle SL+TP touch resolves to{' '}
                <span className="font-medium">SL first</span> — the swing
                engine&apos;s conservative tie-break.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-card ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
        <SectionHeader
          title="Auto-reject list"
          hint="The documented ways this setup fails"
        />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {failureModes.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <span className="text-loss mt-0.5 shrink-0 font-medium" aria-hidden>
                ✗
              </span>
              <span className="text-muted-foreground">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-card ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
        <SectionHeader
          title="Build readiness"
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
        <p className="text-muted-foreground mt-4 border-t pt-3 text-xs">
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
    </div>
  )
}
