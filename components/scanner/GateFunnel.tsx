import { formatInt } from '@/lib/format'

// Canonical gate order (pipeline stages, widest → narrowest). Any stage key not
// in this list is appended after, keeping its original insertion order.
const STAGE_ORDER = [
  'universe',
  'blacklist',
  'history',
  'ban',
  'asm_gsm',
  'circuit',
  'turnover',
  'earnings',
  'ca_ex',
  'regime',
  'candidates',
  'signals',
] as const

const STAGE_LABELS: Record<string, string> = {
  universe: 'Universe',
  blacklist: 'Blacklist',
  history: 'History',
  ban: 'F&O ban',
  asm_gsm: 'ASM / GSM',
  circuit: 'Circuit',
  turnover: 'Turnover',
  earnings: 'Earnings',
  ca_ex: 'Corp action',
  regime: 'Regime',
  candidates: 'Candidates',
  signals: 'Signals',
}

// Server component: renders the gate funnel as horizontal bars whose width is
// proportional to the survivors at each stage. No interactivity, so plain divs
// with a server-computed inline width are fine.
export function GateFunnel({
  gateFunnel,
  universeCount,
}: {
  gateFunnel: Record<string, number>
  universeCount?: number | null
}) {
  const entries = Object.entries(gateFunnel).filter(
    ([, v]) => typeof v === 'number' && !Number.isNaN(v),
  )

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No gate-funnel data for this run.
      </p>
    )
  }

  // Order by the canonical stage list first, then any leftover keys in the order
  // they appear in the document.
  const remaining = new Map<string, number>(entries)
  const ordered: Array<[string, number]> = []
  for (const key of STAGE_ORDER) {
    if (remaining.has(key)) {
      ordered.push([key, remaining.get(key)!])
      remaining.delete(key)
    }
  }
  for (const [key, value] of entries) {
    if (remaining.has(key)) {
      ordered.push([key, value])
      remaining.delete(key)
    }
  }

  const denom = Math.max(
    1,
    universeCount ?? 0,
    ...ordered.map(([, v]) => v),
  )

  return (
    <ol className="space-y-1.5">
      {ordered.map(([key, count]) => {
        const label = STAGE_LABELS[key] ?? key
        const pct = Math.max(0, Math.min(100, (count / denom) * 100))
        return (
          <li
            key={key}
            className="grid grid-cols-[6.5rem_1fr_3.25rem] items-center gap-3 text-sm sm:grid-cols-[8rem_1fr_3.5rem]"
          >
            <span className="text-muted-foreground truncate" title={key}>
              {label}
            </span>
            <div
              className="bg-muted h-5 overflow-hidden rounded"
              role="img"
              aria-label={`${label}: ${formatInt(count)}`}
            >
              <div
                className="bg-primary/80 h-full min-w-[2px] rounded"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-right font-medium tabular-nums">
              {formatInt(count)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
