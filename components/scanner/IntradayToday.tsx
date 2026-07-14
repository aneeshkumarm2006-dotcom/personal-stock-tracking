'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'
import {
  formatCurrency,
  formatIstDate,
  formatIstTime,
  formatPercent,
} from '@/lib/format'
import {
  isWeekendKey,
  istClockMinutes,
  istTodayKey,
  nextTradingDay,
  previousTradingDay,
  sessionsBehind,
} from '@/lib/scanner/freshness'
import { SectionHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { StatusStrip, type StatusItem } from '@/components/scanner/StatusStrip'
import {
  SectorRankingTable,
  CandidateFunnel,
} from '@/components/scanner/IntradaySessionDetail'
import type {
  IntradayLiveDoc,
  IntradayLiveArm,
  IntradayRun,
} from '@/lib/scanner/types'

// The tab's first screen: three health checks (runner · results data · today's
// decision) plus the live "Today" card. Client component — it polls the live doc
// every 15s and re-derives the checks from the wall clock, so the answer to "is
// it running right now?" stays current while the page sits open. Renders a
// neutral shell until mounted (all branches depend on the IST clock, so
// rendering them on the server would hydrate stale).

const POLL_MS = 15_000
const RUNNER_START_MIN = 9 * 60 + 12 // 09:12 IST
const RUNNER_GRACE_MIN = 9 * 60 + 20 // give the first upsert until 09:20
const STALL_MINUTES = 5 // heartbeat is ~30s; 5 min silence = something died

// The live runner's phase strings → an ordered stepper the user reads at a glance.
const PHASE_STEPS: { label: string; time: string; match: string[] }[] = [
  { label: 'Warm up', time: '09:12', match: ['starting', 'setup'] },
  { label: 'Rank sectors', time: '09:20', match: ['ranking-0920'] },
  { label: 'Lock the pick', time: '09:25', match: ['decided'] },
  { label: 'Trade it', time: '09:26+', match: ['live'] },
  { label: 'Done', time: '15:20', match: ['done'] },
]

function phaseIndex(phase: string): number {
  const i = PHASE_STEPS.findIndex((s) => s.match.includes(phase))
  return i === -1 ? 0 : i
}

function phaseWord(phase: string): string {
  switch (phase) {
    case 'starting':
    case 'setup':
      return 'warming up'
    case 'ranking-0920':
      return 'ranking sectors'
    case 'decided':
      return 'pick locked'
    case 'live':
      return 'watching the trade'
    case 'done':
      return 'finished'
    default:
      return phase
  }
}

function pnlCls(v: number | null | undefined) {
  if (v == null || v === 0) return 'text-muted-foreground'
  return v > 0 ? 'text-gain' : 'text-loss'
}

function ageMinutes(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return (now.getTime() - t) / 60_000
}

function PhaseStepper({ phase }: { phase: string }) {
  const current = phaseIndex(phase)
  const done = phase === 'done'
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
      {PHASE_STEPS.map((step, i) => {
        const state =
          done || i < current ? 'done' : i === current ? 'active' : 'pending'
        return (
          <li key={step.label} className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1',
                state === 'done' && 'bg-gain/10 text-gain',
                state === 'active' &&
                  'bg-primary/10 text-primary ring-primary/30 font-medium ring-1',
                state === 'pending' && 'text-muted-foreground',
              )}
            >
              <span aria-hidden className="tabular-nums opacity-70">
                {step.time}
              </span>
              {step.label}
              {state === 'done' && <span aria-hidden>✓</span>}
            </span>
            {i < PHASE_STEPS.length - 1 && (
              <span aria-hidden className="text-muted-foreground/40">
                ›
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Level({
  label,
  value,
  cls,
  sub,
}: {
  label: string
  value: string
  cls?: string
  sub?: string
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('font-medium tabular-nums', cls)}>{value}</p>
      {sub && (
        <p className="text-muted-foreground text-[11px] tabular-nums">{sub}</p>
      )}
    </div>
  )
}

function ArmLive({
  armKey,
  arm,
}: {
  armKey: string
  arm: IntradayLiveArm | undefined
}) {
  if (!arm) return null
  const closed = arm.status === 'CLOSED'
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          Exit {armKey}{' '}
          <span className="text-muted-foreground text-xs">
            {armKey === 'A' ? 'books at 1.5× risk' : 'holds for 2× risk'}
          </span>
        </span>
        <Badge
          className={cn(
            'border-transparent text-[10px]',
            closed
              ? arm.exitReason === 'TP'
                ? 'bg-gain/10 text-gain'
                : arm.exitReason === 'SL'
                  ? 'bg-loss/10 text-loss'
                  : 'bg-secondary text-secondary-foreground'
              : 'bg-secondary text-secondary-foreground',
          )}
        >
          {closed
            ? arm.exitReason === 'TP'
              ? 'target hit'
              : arm.exitReason === 'SL'
                ? 'stopped out'
                : (arm.exitReason ?? 'closed')
            : 'running'}
        </Badge>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
        <span className="tabular-nums">
          <span className="text-muted-foreground">target </span>
          {formatCurrency(arm.target)}
        </span>
        {closed && arm.exitPrice != null && (
          <span className="tabular-nums">
            <span className="text-muted-foreground">exit </span>
            {formatCurrency(arm.exitPrice)}
            {arm.exitTime && (
              <span className="text-muted-foreground"> {arm.exitTime}</span>
            )}
          </span>
        )}
        {closed && arm.netPnl != null && (
          <span className={cn('font-medium tabular-nums', pnlCls(arm.netPnl))}>
            {formatCurrency(arm.netPnl)}
            {arm.rMultiple != null && ` · ${arm.rMultiple}R`}
          </span>
        )}
      </div>
    </div>
  )
}

// Plain-English one-liner for exactly where today's trade stands.
function liveStatusSentence(doc: IntradayLiveDoc): string | null {
  const s = doc.live
  if (!s) return null
  if (s.status === 'ARMED') {
    return `No trade yet — waiting for the price to cross ${formatCurrency(s.trigger)}. If it never does by 10:30, today is a no-trade day.`
  }
  if (s.status === 'ENTERED') {
    return `In the trade — entered at ${formatCurrency(s.entryPrice)}${s.entryTime ? ` (${s.entryTime})` : ''}. It now either hits a target, the stop, or gets closed at 15:15.`
  }
  if (s.status === 'DONE') {
    const net = (s.arms?.A?.netPnl ?? 0) + (s.arms?.B?.netPnl ?? 0)
    return `Done for the day — both exits are closed, ${net >= 0 ? 'making' : 'losing'} ${formatCurrency(Math.abs(net))} net across the two.`
  }
  if (s.status === 'SKIPPED') {
    return s.skipReason
      ? `Trade skipped — ${s.skipReason}.`
      : 'Trade skipped.'
  }
  return null
}

function statusBadge(doc: IntradayLiveDoc) {
  const s = doc.live
  const label =
    s?.status === 'ARMED'
      ? 'armed — waiting for trigger'
      : s?.status === 'ENTERED'
        ? 'in trade'
        : s?.status === 'DONE'
          ? 'closed'
          : s?.status === 'SKIPPED'
            ? 'skipped'
            : doc.phase === 'done'
              ? 'session over'
              : phaseWord(doc.phase)
  const cls =
    s?.status === 'ENTERED'
      ? 'bg-gain/10 text-gain'
      : s?.status === 'SKIPPED'
        ? 'bg-loss/10 text-loss'
        : 'bg-secondary text-secondary-foreground'
  return <Badge className={cn('border-transparent', cls)}>{label}</Badge>
}

// The full live-session card for today's doc.
function LiveCard({ doc, now }: { doc: IntradayLiveDoc; now: Date }) {
  const s = doc.live
  const long = (s?.direction ?? doc.direction) === 'long'
  const chosenName =
    doc.sectorTable?.find((r) => r.key === doc.sector)?.name ?? null
  const hasRanking = (doc.sectorTable?.length ?? 0) > 0
  const hasFunnel = (doc.picks?.length ?? 0) + (doc.rejects?.length ?? 0) > 0
  const sentence = liveStatusSentence(doc)
  const running = doc.phase !== 'done'
  const age = ageMinutes(doc.updatedAt, now)
  const stalled = running && age != null && age > STALL_MINUTES

  return (
    <div className="bg-card ring-foreground/10 space-y-4 rounded-xl p-5 ring-1 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {running && !stalled && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="bg-gain absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
              <span className="bg-gain relative inline-flex h-2.5 w-2.5 rounded-full" />
            </span>
          )}
          <h3 className="text-base font-semibold">
            Today · {formatIstDate(doc.date)}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {doc.updatedAt && (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              updated {formatIstTime(doc.updatedAt)}
            </span>
          )}
          {statusBadge(doc)}
        </div>
      </div>

      {stalled && (
        <p className="bg-loss/5 text-loss rounded-lg px-3 py-2 text-sm">
          The runner has gone quiet — no update since{' '}
          {formatIstTime(doc.updatedAt)}. It may have crashed on the scanner PC;
          check the IntradayLiveRunner task.
        </p>
      )}

      <PhaseStepper phase={doc.phase} />

      {!s && (
        <p className="text-muted-foreground text-sm">
          {doc.noTradeReason
            ? `No trade today — ${doc.noTradeReason}.`
            : doc.sector
              ? `Sector decided: ${(chosenName ?? doc.sector).replace(/^NIFTY /, '')} (${doc.direction}). Preparing the pick…`
              : 'Watching the open — sector ranking at 9:20, pick locked at 9:25.'}
        </p>
      )}

      {s && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-lg font-semibold">{s.symbol}</span>
            <Badge
              className={cn(
                'border-transparent',
                long ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss',
              )}
            >
              {s.direction}
            </Badge>
            {chosenName && (
              <span className="text-muted-foreground">
                {chosenName.replace(/^NIFTY /, '')} sector
              </span>
            )}
            {doc.plan?.pct925 != null && (
              <span
                className={cn('text-xs tabular-nums', pnlCls(doc.plan.pct925))}
              >
                {formatPercent(doc.plan.pct925)} @ 9:25
              </span>
            )}
            {s.lastLtp != null && (
              <span className="ml-auto tabular-nums">
                <span className="text-muted-foreground text-xs">price </span>
                <span className="font-medium">{formatCurrency(s.lastLtp)}</span>
                <span className="text-muted-foreground text-xs">
                  {' '}
                  {s.lastLtpTime}
                </span>
              </span>
            )}
          </div>

          {sentence && <p className="text-sm">{sentence}</p>}

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Level
              label={long ? 'Buy above' : 'Sell below'}
              value={formatCurrency(s.trigger)}
            />
            <Level
              label="Stop-loss"
              value={formatCurrency(s.stop)}
              cls="text-loss"
              sub={
                s.rPerShare != null
                  ? `${formatCurrency(s.rPerShare)}/sh risk`
                  : undefined
              }
            />
            <Level
              label="Target A (1.5×)"
              value={formatCurrency(s.arms?.A?.target ?? null)}
              cls="text-gain"
            />
            <Level
              label="Target B (2×)"
              value={formatCurrency(s.arms?.B?.target ?? null)}
              cls="text-gain"
            />
            <Level label="Shares" value={String(s.qty)} />
            <Level
              label="Entry"
              value={s.entryPrice != null ? formatCurrency(s.entryPrice) : '—'}
              sub={s.entryTime ?? undefined}
            />
          </div>

          {(s.status === 'ENTERED' || s.status === 'DONE') &&
            s.entryPrice != null && (
              <div className="grid gap-2 sm:grid-cols-2">
                <ArmLive armKey="A" arm={s.arms?.A} />
                <ArmLive armKey="B" arm={s.arms?.B} />
              </div>
            )}
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
                  sectorTable={doc.sectorTable!}
                  chosenKey={doc.sector}
                  direction={doc.direction}
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
                  direction={doc.direction}
                  picks={doc.picks ?? []}
                  rejects={doc.rejects ?? []}
                />
              </div>
            )}
          </div>
        </details>
      )}

      {s && s.events.length > 0 && (
        <details className="group border-t pt-3">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-xs font-medium">
            <span className="group-open:hidden">▸ </span>
            <span className="hidden group-open:inline">▾ </span>
            Event log ({s.events.length})
          </summary>
          <ol className="text-muted-foreground mt-2 max-h-48 space-y-1 overflow-y-auto border-t pt-2 text-xs">
            {s.events
              .slice()
              .reverse()
              .map((e, i) => (
                <li key={`${e.time}-${i}`} className="tabular-nums">
                  <span className="text-foreground">{e.time}</span> ·{' '}
                  <span className="uppercase">{e.type}</span> — {e.detail}
                </li>
              ))}
          </ol>
        </details>
      )}

      {doc.warnings && doc.warnings.length > 0 && (
        <details className="border-t pt-3">
          <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
            Data warnings ({doc.warnings.length})
          </summary>
          <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
            {doc.warnings.map((w, i) => (
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

// Shown when there is no live doc for today — says plainly WHY there's nothing,
// instead of just rendering nothing like the old panel did.
function NoSessionCard({
  todayKey,
  minutes,
}: {
  todayKey: string
  minutes: number
}) {
  if (isWeekendKey(todayKey)) {
    return (
      <div className="bg-muted/30 ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
        <p className="text-sm font-medium">Market closed — it&apos;s the weekend.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Next session {formatIstDate(nextTradingDay(todayKey))}: the runner
          starts at 09:12 and locks the pick around 09:26. The latest results
          are below.
        </p>
      </div>
    )
  }
  if (minutes < RUNNER_START_MIN) {
    return (
      <div className="bg-muted/30 ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
        <p className="text-sm font-medium">
          Today&apos;s session hasn&apos;t started yet.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          The runner wakes at 09:12, ranks sectors at 09:20 and locks the pick
          around 09:26 — live progress will appear right here.
        </p>
      </div>
    )
  }
  if (minutes < RUNNER_GRACE_MIN) {
    return (
      <div className="bg-muted/30 ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
        <p className="text-sm font-medium">Runner starting…</p>
        <p className="text-muted-foreground mt-1 text-sm">
          It wakes at 09:12 — waiting for its first report.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-xl bg-amber-500/5 p-5 ring-1 ring-amber-500/30 sm:p-6">
      <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
        Nothing reported today.
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        If today isn&apos;t a market holiday, the 09:12 scheduled task
        (IntradayLiveRunner) didn&apos;t fire — check Task Scheduler on the
        scanner PC. The latest completed results are below.
      </p>
    </div>
  )
}

export function IntradayToday({
  initialLive,
  latestRun,
}: {
  initialLive: IntradayLiveDoc | null
  latestRun: IntradayRun | null
}) {
  const [doc, setDoc] = useState<IntradayLiveDoc | null>(initialLive)
  // Wall clock drives every branch below; keeping it in state (set on mount,
  // refreshed with each poll) makes the render deterministic for hydration.
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const res = await fetch('/api/scanner/intraday/live', {
          cache: 'no-store',
        })
        if (res.ok) {
          const data = (await res.json()) as IntradayLiveDoc | null
          if (!stop && data) setDoc(data)
        }
      } catch {
        // transient — next poll retries
      }
      if (!stop) setNow(new Date())
    }
    void load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [])

  const header = (
    <SectionHeader
      title="Right now"
      hint="is it running, and what did it decide"
      actions={
        <Link
          href="/scanner/health"
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
        >
          Full system health →
        </Link>
      }
    />
  )

  if (!now) {
    return (
      <section className="space-y-3">
        {header}
        <div className="bg-muted/30 ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
          <p className="text-muted-foreground text-sm">
            Checking today&apos;s session…
          </p>
        </div>
      </section>
    )
  }

  const todayKey = istTodayKey(now)
  const minutes = istClockMinutes(now)
  const weekend = isWeekendKey(todayKey)
  const live = doc && doc.date === todayKey ? doc : null
  const s = live?.live ?? null

  // ── check 1: the 09:12 live runner ─────────────────────────────────────────
  let runner: StatusItem
  if (weekend) {
    runner = {
      label: 'Live runner',
      level: 'muted',
      value: 'Market closed',
      sub: 'weekend — nothing to run',
    }
  } else if (live) {
    const age = ageMinutes(live.updatedAt, now)
    const stalled =
      live.phase !== 'done' && age != null && age > STALL_MINUTES
    if (stalled) {
      runner = {
        label: 'Live runner',
        level: 'down',
        value: 'Stalled',
        sub: `no update since ${formatIstTime(live.updatedAt)}`,
      }
    } else if (live.phase === 'done') {
      runner = {
        label: 'Live runner',
        level: 'ok',
        value: 'Finished for today',
        sub: 'ran 09:12 – 15:20',
      }
    } else {
      runner = {
        label: 'Live runner',
        level: 'ok',
        pulse: true,
        value: `Running — ${phaseWord(live.phase)}`,
        sub: live.updatedAt
          ? `last update ${formatIstTime(live.updatedAt)}`
          : undefined,
      }
    }
  } else if (minutes < RUNNER_START_MIN) {
    runner = {
      label: 'Live runner',
      level: 'muted',
      value: 'Not started yet',
      sub: 'starts 09:12 on trading days',
    }
  } else if (minutes < RUNNER_GRACE_MIN) {
    runner = {
      label: 'Live runner',
      level: 'muted',
      value: 'Starting…',
      sub: 'waiting for the first report',
    }
  } else {
    runner = {
      label: 'Live runner',
      level: 'warn',
      value: 'No report today',
      sub: 'market holiday — or the 09:12 task didn’t fire',
    }
  }

  // ── check 2: the results record (evening / 4 AM replay) ────────────────────
  const expected = previousTradingDay(todayKey)
  let record: StatusItem
  if (!latestRun) {
    record = {
      label: 'Results data',
      level: 'warn',
      value: 'No sessions recorded yet',
      sub: 'the first replay will appear after a session completes',
    }
  } else if (latestRun.status === 'failed') {
    record = {
      label: 'Results data',
      level: 'down',
      value: `Last replay failed`,
      sub: `${formatIstDate(latestRun.date)} — check the evening run logs`,
    }
  } else {
    const behind = sessionsBehind(latestRun.date, expected)
    if (behind === 0) {
      record = {
        label: 'Results data',
        level: 'ok',
        value: 'Up to date',
        sub: `results through ${formatIstDate(latestRun.date)}`,
      }
    } else if (behind === 1) {
      record = {
        label: 'Results data',
        level: 'warn',
        value: '1 session behind',
        sub: `last ${formatIstDate(latestRun.date)} — holiday, or the 4 AM replay hasn’t run yet`,
      }
    } else {
      record = {
        label: 'Results data',
        level: 'down',
        value: `${behind} sessions behind`,
        sub: `last ${formatIstDate(latestRun.date)} — check the scheduled task`,
      }
    }
  }

  // ── check 3: today's decision ───────────────────────────────────────────────
  let decision: StatusItem
  if (weekend) {
    decision = {
      label: "Today's decision",
      level: 'muted',
      value: '—',
      sub: 'market closed',
    }
  } else if (live) {
    if (s?.symbol) {
      if (s.status === 'ENTERED') {
        decision = {
          label: "Today's decision",
          level: 'ok',
          pulse: true,
          value: `${s.symbol} — in the trade`,
          sub: `entered at ${formatCurrency(s.entryPrice)}`,
        }
      } else if (s.status === 'DONE') {
        const net = (s.arms?.A?.netPnl ?? 0) + (s.arms?.B?.netPnl ?? 0)
        decision = {
          label: "Today's decision",
          level: 'ok',
          value: `${s.symbol} — traded, closed`,
          sub: (
            <span className={cn('font-medium tabular-nums', pnlCls(net))}>
              {formatCurrency(net)} net
            </span>
          ),
        }
      } else if (s.status === 'SKIPPED') {
        decision = {
          label: "Today's decision",
          level: 'ok',
          value: 'No trade — pick skipped',
          sub: s.skipReason ?? undefined,
        }
      } else {
        decision = {
          label: "Today's decision",
          level: 'ok',
          value: `${s.symbol} — ${s.direction}`,
          sub: `waiting for ${formatCurrency(s.trigger)}`,
        }
      }
    } else if (live.noTradeReason) {
      decision = {
        label: "Today's decision",
        level: 'ok',
        value: 'No trade today',
        sub: live.noTradeReason,
      }
    } else {
      decision = {
        label: "Today's decision",
        level: 'muted',
        value: 'Deciding at 9:25…',
        sub: 'sector ranking at 9:20, pick locked at 9:25',
      }
    }
  } else if (latestRun && latestRun.date === todayKey) {
    decision =
      latestRun.status === 'ok'
        ? {
            label: "Today's decision",
            level: 'ok',
            value: 'Traded — replay below',
            sub: (
              <span className="tabular-nums">
                A {formatCurrency(latestRun.dayPnlA ?? 0)} · B{' '}
                {formatCurrency(latestRun.dayPnlB ?? 0)}
              </span>
            ),
          }
        : {
            label: "Today's decision",
            level: 'ok',
            value: 'No trade today',
            sub: latestRun.noTradeReason ?? undefined,
          }
  } else {
    decision = {
      label: "Today's decision",
      level: 'muted',
      value: minutes < RUNNER_START_MIN ? 'Not decided yet' : 'Nothing reported',
      sub:
        minutes < RUNNER_START_MIN
          ? 'the pick locks in around 09:26'
          : 'see the runner check',
    }
  }

  return (
    <section className="space-y-3">
      {header}
      <StatusStrip items={[runner, record, decision]} />
      {live ? (
        <LiveCard doc={live} now={now} />
      ) : (
        <NoSessionCard todayKey={todayKey} minutes={minutes} />
      )}
    </section>
  )
}
