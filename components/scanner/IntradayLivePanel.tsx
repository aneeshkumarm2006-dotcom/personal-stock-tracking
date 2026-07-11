'use client'

import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import { formatCurrency, formatIstDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'

// Polls /api/scanner/intraday/live while mounted and renders the live session:
// phase (setup → ranking → decided → live → done), the ~9:26 pick with its levels,
// then real-time trigger/SL/TP state as the Python live runner publishes ticks.
// Renders nothing when there is no doc for today (weekend, runner not started) —
// the surrounding server-rendered tab already shows the historical record.

type LiveArm = {
  target: number
  status: string
  exitPrice: number | null
  exitTime: string | null
  exitReason: string | null
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
  entryTime: string | null
  entryPrice: number | null
  lastLtp: number | null
  lastLtpTime: string | null
  skipReason: string | null
  arms: Record<string, LiveArm>
  events: { time: string; type: string; detail: string }[]
}

type LiveDoc = {
  id: string
  date: string
  phase: string
  sector?: string | null
  direction?: string | null
  noTradeReason?: string | null
  plan?: { symbol: string; rv?: number | null; pct925?: number } | null
  live?: LiveState | null
}

const POLL_MS = 15_000

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
            : phase
  const cls =
    s?.status === 'ENTERED'
      ? 'bg-gain/10 text-gain'
      : s?.status === 'SKIPPED'
        ? 'bg-loss/10 text-loss'
        : 'bg-secondary text-secondary-foreground'
  return <Badge className={cn('border-transparent', cls)}>{label}</Badge>
}

export function IntradayLivePanel() {
  const [doc, setDoc] = useState<LiveDoc | null>(null)

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const res = await fetch('/api/scanner/intraday/live', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as LiveDoc | null
        if (!stop) setDoc(data)
      } catch {
        // transient — next poll retries
      }
    }
    void load()
    const t = setInterval(load, POLL_MS)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [])

  // Only surface the panel for TODAY's session — yesterday's finished doc belongs
  // to the historical tables below, not a "live" banner.
  if (!doc || doc.date !== istToday()) return null

  const s = doc.live
  const long = s?.direction === 'long'

  return (
    <div className="bg-card ring-foreground/10 rounded-xl p-5 ring-1 sm:p-6">
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
        {statusBadge(s, doc.phase)}
      </div>

      {!s && (
        <p className="text-muted-foreground mt-3 text-sm">
          {doc.noTradeReason
            ? `No trade today — ${doc.noTradeReason}.`
            : doc.sector
              ? `Sector decided: ${doc.sector} (${doc.direction}). Preparing the pick…`
              : 'Watching the open — sector ranking at 9:20, confirmation at 9:25.'}
        </p>
      )}

      {s && (
        <div className="mt-4 space-y-4">
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
            {doc.sector && (
              <span className="text-muted-foreground">{doc.sector}</span>
            )}
            {s.lastLtp != null && (
              <span className="tabular-nums">
                LTP {formatCurrency(s.lastLtp)}
                <span className="text-muted-foreground text-xs">
                  {' '}
                  {s.lastLtpTime}
                </span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div>
              <p className="text-muted-foreground text-xs">
                {long ? 'Buy above' : 'Sell below'}
              </p>
              <p className="font-medium tabular-nums">{formatCurrency(s.trigger)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Stop</p>
              <p className="font-medium tabular-nums">{formatCurrency(s.stop)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Target A (1:1.5)</p>
              <p className="font-medium tabular-nums">
                {formatCurrency(s.arms?.A?.target ?? null)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Target B (1:2)</p>
              <p className="font-medium tabular-nums">
                {formatCurrency(s.arms?.B?.target ?? null)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Qty</p>
              <p className="font-medium tabular-nums">{s.qty}</p>
            </div>
          </div>

          {s.entryPrice != null && (
            <p className="text-sm">
              Entered at{' '}
              <span className="font-medium tabular-nums">
                {formatCurrency(s.entryPrice)}
              </span>{' '}
              <span className="text-muted-foreground text-xs">{s.entryTime}</span>
              {(['A', 'B'] as const).map((k) => {
                const a = s.arms?.[k]
                if (!a || a.status === 'OPEN') return null
                return (
                  <span key={k} className="ml-3 tabular-nums">
                    {k}: {a.exitReason}{' '}
                    <span className={pnlCls(a.netPnl)}>
                      {a.netPnl != null ? formatCurrency(a.netPnl) : ''}
                    </span>
                  </span>
                )
              })}
            </p>
          )}

          {s.skipReason && (
            <p className="text-muted-foreground text-sm">Skipped — {s.skipReason}.</p>
          )}

          {s.events.length > 0 && (
            <ol className="text-muted-foreground space-y-1 border-t pt-3 text-xs">
              {s.events.slice(-6).map((e, i) => (
                <li key={`${e.time}-${i}`} className="tabular-nums">
                  {e.time} · {e.type} — {e.detail}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
