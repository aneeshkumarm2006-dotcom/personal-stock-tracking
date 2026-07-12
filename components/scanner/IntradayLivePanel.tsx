'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { formatCurrency, formatIstDate, formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import {
  SectorRankingTable,
  CandidateFunnel,
} from '@/components/scanner/IntradaySessionDetail'
import type {
  IntradayPick,
  IntradayReject,
  IntradaySectorRow,
} from '@/lib/scanner/types'

// Polls /api/scanner/intraday/live while mounted and renders the whole live
// session as it unfolds: the phase stepper, the 9:20→9:25 sector ranking, the
// candidate funnel (who was picked and why everyone else was dropped), the pick's
// levels, then real-time trigger/SL/TP state as the Python live runner publishes
// ticks. Renders nothing when there's no doc for today (weekend / runner not
// started) — the historical tables below already carry the record.

type LiveArm = {
  target: number
  status: string
  exitPrice: number | null
  exitTime: string | null
  exitReason: string | null
  grossPnl?: number
  costs?: number
  netPnl?: number
  rMultiple?: number | null
}

type LiveState = {
  symbol: string
  direction: string
  status: string
  trigger: number
  stop: number
  qty: number
  rPerShare?: number
  entryTime: string | null
  entryPrice: number | null
  lastLtp: number | null
  lastLtpTime: string | null
  skipReason: string | null
  arms: Record<string, LiveArm>
  events: { time: string; type: string; detail: string }[]
}

type LivePlan = {
  symbol: string
  rv?: number | null
  pct925?: number | null
  trigger?: number
  stop?: number
  qty?: number
}

type LiveDoc = {
  id: string
  date: string
  phase: string
  sector?: string | null
  direction?: string | null
  noTradeReason?: string | null
  plan?: LivePlan | null
  live?: LiveState | null
  sectorTable?: IntradaySectorRow[]
  picks?: IntradayPick[]
  rejects?: IntradayReject[]
  warnings?: string[]
  updatedAt?: string | null
}

const POLL_MS = 15_000

// The live runner's phase strings → an ordered stepper the user can read at a glance.
const PHASE_STEPS: { label: string; time: string; match: string[] }[] = [
  { label: 'Setup', time: '09:12', match: ['starting', 'setup'] },
  { label: 'Rank sectors', time: '09:20', match: ['ranking-0920'] },
  { label: 'Decide pick', time: '09:25', match: ['decided'] },
  { label: 'Live', time: '09:26+', match: ['live'] },
  { label: 'Done', time: '15:20', match: ['done'] },
]

function phaseIndex(phase: string): number {
  const i = PHASE_STEPS.findIndex((s) => s.match.includes(phase))
  return i === -1 ? 0 : i
}

function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(),
  )
}

function pnlCls(v: number | null | undefined) {
  if (v == null || v === 0) return 'text-muted-foreground'
  return v > 0 ? 'text-gain' : 'text-loss'
}

function statusBadge(s: LiveState | null | undefined, phase: string) {
  const label =
    s?.status === 'ARMED'
      ? 'armed — waiting for trigger'
      : s?.status === 'ENTERED'
        ? 'in trade'
        : s?.status === 'DONE'
          ? 'closed'
          : s?.status === 'SKIPPED'
            ? 'skipped'
            : phase === 'done'
              ? 'session over'
              : phase
  const cls =
    s?.status === 'ENTERED'
      ? 'bg-gain/10 text-gain'
      : s?.status === 'SKIPPED'
        ? 'bg-loss/10 text-loss'
        : 'bg-secondary text-secondary-foreground'
  return <Badge className={cn('border-transparent', cls)}>{label}</Badge>
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
                  'bg-primary/10 text-primary font-medium ring-1 ring-primary/30',
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
      {sub && <p className="text-muted-foreground text-[11px] tabular-nums">{sub}</p>}
    </div>
  )
}

function ArmLive({ armKey, arm }: { armKey: string; arm: LiveArm | undefined }) {
  if (!arm) return null
  const closed = arm.status === 'CLOSED'
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          Arm {armKey}{' '}
          <span className="text-muted-foreground text-xs">
            {armKey === 'A' ? '1:1.5' : '1:2'}
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
          {closed ? (arm.exitReason ?? 'closed') : 'open'}
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

export function IntradayLivePanel() {
  const [doc, setDoc] = useState<LiveDoc | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const res = await fetch('/api/scanner/intraday/live', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as LiveDoc | null
        if (!stop) {
          setDoc(data)
          setUpdatedAt(new Date())
        }
      } catch {
        // transient — next poll retries
      }
    }
    void load()
    timer.current = setInterval(load, POLL_MS)
    return () => {
      stop = true
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  // Only surface the panel for TODAY's session — yesterday's finished doc belongs
  // to the historical tables below, not a "live" banner.
  if (!doc || doc.date !== istToday()) return null

  const s = doc.live
  const long = (s?.direction ?? doc.direction) === 'long'
  const chosenName =
    doc.sectorTable?.find((r) => r.key === doc.sector)?.name ?? null
  const hasRanking = (doc.sectorTable?.length ?? 0) > 0
  const hasFunnel = (doc.picks?.length ?? 0) + (doc.rejects?.length ?? 0) > 0

  return (
    <div className="bg-card ring-foreground/10 space-y-4 rounded-xl p-5 ring-1 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="bg-gain absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
            <span className="bg-gain relative inline-flex h-2.5 w-2.5 rounded-full" />
          </span>
          <h3 className="text-base font-semibold">
            Live session · {formatIstDate(doc.date)}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              updated{' '}
              {new Intl.DateTimeFormat('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              }).format(updatedAt)}
            </span>
          )}
          {statusBadge(s, doc.phase)}
        </div>
      </div>

      <PhaseStepper phase={doc.phase} />

      {!s && (
        <p className="text-muted-foreground text-sm">
          {doc.noTradeReason
            ? `No trade today — ${doc.noTradeReason}.`
            : doc.sector
              ? `Sector decided: ${(chosenName ?? doc.sector).replace(/^NIFTY /, '')} (${doc.direction}). Preparing the pick…`
              : 'Watching the open — sector ranking at 9:20, confirmation at 9:25.'}
        </p>
      )}

      {s && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-base font-semibold">{s.symbol}</span>
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
                {chosenName.replace(/^NIFTY /, '')}
              </span>
            )}
            {doc.plan?.pct925 != null && (
              <span className={cn('text-xs tabular-nums', pnlCls(doc.plan.pct925))}>
                {formatPercent(doc.plan.pct925)} @ 9:25
              </span>
            )}
            {doc.plan?.rv != null && (
              <span className="text-muted-foreground text-xs tabular-nums">
                RV {doc.plan.rv}×
              </span>
            )}
            {s.lastLtp != null && (
              <span className="ml-auto tabular-nums">
                <span className="text-muted-foreground text-xs">LTP </span>
                <span className="font-medium">{formatCurrency(s.lastLtp)}</span>
                <span className="text-muted-foreground text-xs"> {s.lastLtpTime}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Level
              label={long ? 'Buy above' : 'Sell below'}
              value={formatCurrency(s.trigger)}
            />
            <Level
              label="Stop"
              value={formatCurrency(s.stop)}
              cls="text-loss"
              sub={s.rPerShare != null ? `${formatCurrency(s.rPerShare)}/sh risk` : undefined}
            />
            <Level
              label="Target A (1:1.5)"
              value={formatCurrency(s.arms?.A?.target ?? null)}
              cls="text-gain"
            />
            <Level
              label="Target B (1:2)"
              value={formatCurrency(s.arms?.B?.target ?? null)}
              cls="text-gain"
            />
            <Level label="Qty" value={String(s.qty)} />
            <Level
              label="Entry"
              value={s.entryPrice != null ? formatCurrency(s.entryPrice) : '—'}
              sub={s.entryTime ?? undefined}
            />
          </div>

          {(s.status === 'ENTERED' || s.status === 'DONE') && s.entryPrice != null && (
            <div className="grid gap-2 sm:grid-cols-2">
              <ArmLive armKey="A" arm={s.arms?.A} />
              <ArmLive armKey="B" arm={s.arms?.B} />
            </div>
          )}

          {s.skipReason && (
            <p className="text-loss/90 text-sm">Skipped — {s.skipReason}.</p>
          )}

          {s.events.length > 0 && (
            <details className="group" open>
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
        </div>
      )}

      {(hasRanking || hasFunnel) && (
        <div className="grid gap-5 border-t pt-4 lg:grid-cols-2">
          {hasRanking && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
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
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
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
