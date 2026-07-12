import { cn } from '@/lib/utils'
import { formatPercent } from '@/lib/format'
import type {
  IntradayPick,
  IntradayReject,
  IntradaySectorRow,
} from '@/lib/scanner/types'

// Shared, presentational (no hooks / no server-only imports) so it renders inside
// both the client live panel and the server-rendered replay tab. Shows the two
// decision layers the engine records but the old UI threw away:
//   1. Sector ranking — every sectoral index at 9:20 → 9:25, leader highlighted.
//   2. Candidate funnel — who survived the checklist and, for everyone dropped,
//      exactly which gate rejected them (the engine's own reason strings).

function pctCls(v: number | null | undefined) {
  if (v == null || v === 0) return 'text-muted-foreground'
  return v > 0 ? 'text-gain' : 'text-loss'
}

function absOr0(v: number | null | undefined): number {
  return v == null ? 0 : Math.abs(v)
}

// Order reject reasons hardest-gate-first; runners-up ("not the top mover" — they
// passed everything, just weren't #1) sink to the bottom.
const REASON_ORDER = [
  'no-data',
  'missing 09:15 bar',
  'missing 09:20 bar / prev close',
  'direction mismatch',
  'zero-range first bar',
  'doji first bar',
  'wrong side of VWAP',
  'not the top mover',
]

function reasonRank(reason: string): number {
  const i = REASON_ORDER.findIndex((r) => reason.startsWith(r))
  // Exclusion strings (ban/ASM/series/band) are unknown here — surface them first.
  return i === -1 ? -1 : i
}

export function SectorRankingTable({
  sectorTable,
  chosenKey,
  direction,
}: {
  sectorTable: IntradaySectorRow[]
  chosenKey?: string | null
  direction?: string | null
}) {
  if (!sectorTable || sectorTable.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No sector ranking recorded.</p>
    )
  }
  const rows = [...sectorTable].sort((a, b) => absOr0(b.pct925) - absOr0(a.pct925))
  const maxAbs = Math.max(1e-6, ...rows.map((r) => absOr0(r.pct925)))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[380px] text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="py-1.5 pr-2 font-medium">#</th>
            <th className="py-1.5 pr-2 font-medium">Sector</th>
            <th className="py-1.5 pr-2 text-right font-medium">9:20</th>
            <th className="py-1.5 pr-2 text-right font-medium">9:25</th>
            <th className="w-[34%] py-1.5 pl-2 font-medium">Move at 9:25</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const chosen = chosenKey != null && r.key === chosenKey
            const pct = (absOr0(r.pct925) / maxAbs) * 100
            const up = (r.pct925 ?? 0) > 0
            return (
              <tr
                key={r.key}
                className={cn(
                  'border-b last:border-0',
                  chosen && 'bg-primary/5',
                )}
              >
                <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                  {i + 1}
                </td>
                <td className="py-1.5 pr-2">
                  <span className={cn('font-medium', chosen && 'text-foreground')}>
                    {r.name.replace(/^NIFTY /, '')}
                  </span>
                  {r.proxy && (
                    <span
                      className="text-muted-foreground ml-1.5 text-[10px] uppercase tracking-wide"
                      title="No Angel index — ranked via an equal-weight constituent proxy"
                    >
                      proxy
                    </span>
                  )}
                  {chosen && (
                    <span className="bg-primary/15 text-primary ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                      leader · {direction}
                    </span>
                  )}
                </td>
                <td
                  className={cn(
                    'py-1.5 pr-2 text-right text-xs tabular-nums',
                    'text-muted-foreground',
                  )}
                >
                  {r.pct920 != null ? formatPercent(r.pct920) : '—'}
                </td>
                <td
                  className={cn(
                    'py-1.5 pr-2 text-right font-medium tabular-nums',
                    pctCls(r.pct925),
                  )}
                >
                  {r.pct925 != null ? formatPercent(r.pct925) : '—'}
                </td>
                <td className="py-1.5 pl-2">
                  <div
                    className="bg-muted h-2 overflow-hidden rounded-full"
                    role="img"
                    aria-label={`${r.name} ${r.pct925 != null ? formatPercent(r.pct925) : 'no data'}`}
                  >
                    <div
                      className={cn(
                        'h-full min-w-[2px] rounded-full',
                        up ? 'bg-gain' : 'bg-loss',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RejectFunnel({ rejects }: { rejects: IntradayReject[] }) {
  // Group by reason, keep the hardest gates first.
  const groups = new Map<string, IntradayReject[]>()
  for (const r of rejects) {
    const arr = groups.get(r.reason) ?? []
    arr.push(r)
    groups.set(r.reason, arr)
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const ra = reasonRank(a[0])
    const rb = reasonRank(b[0])
    if (ra !== rb) return ra - rb
    return b[1].length - a[1].length
  })

  return (
    <ul className="space-y-1.5">
      {ordered.map(([reason, items]) => (
        <li key={reason} className="text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-loss/90 shrink-0 font-medium">
              {reason}
              <span className="text-muted-foreground font-normal">
                {' '}
                ({items.length})
              </span>
            </span>
            <span className="text-muted-foreground min-w-0 text-xs">
              {items
                .slice()
                .sort((a, b) => absOr0(b.pct925) - absOr0(a.pct925))
                .map((it) =>
                  it.pct925 != null
                    ? `${it.symbol} ${formatPercent(it.pct925)}`
                    : it.symbol,
                )
                .join(' · ')}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function CandidateFunnel({
  sectorName,
  direction,
  picks,
  rejects,
}: {
  sectorName?: string | null
  direction?: string | null
  picks: IntradayPick[]
  rejects: IntradayReject[]
}) {
  const total = picks.length + rejects.length
  if (total === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No candidate funnel recorded for this session.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        {total} constituent{total === 1 ? '' : 's'} of{' '}
        <span className="text-foreground font-medium">
          {sectorName ? sectorName.replace(/^NIFTY /, '') : 'the leading sector'}
        </span>{' '}
        assessed{direction ? ` on the ${direction} side` : ''} — {picks.length}{' '}
        passed the checklist.
      </p>

      {picks.length > 0 && (
        <div className="space-y-1">
          <p className="text-gain text-xs font-semibold uppercase tracking-wide">
            ✓ Picked — the trade
          </p>
          <ul className="space-y-1">
            {picks.map((p) => (
              <li
                key={p.symbol}
                className="flex flex-wrap items-baseline gap-x-3 text-sm"
              >
                <span className="font-semibold">{p.symbol}</span>
                <span className={cn('tabular-nums', pctCls(p.pct925))}>
                  {p.pct925 != null ? formatPercent(p.pct925) : '—'}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  RV {p.rv != null ? `${p.rv}×` : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejects.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            ✗ Rejected ({rejects.length})
          </p>
          <RejectFunnel rejects={rejects} />
        </div>
      )}
    </div>
  )
}
