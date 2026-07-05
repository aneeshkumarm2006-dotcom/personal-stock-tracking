import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatInt, formatIstDateTime } from '@/lib/format'
import type { ScannerEvent } from '@/lib/scanner/types'

// Friendlier labels for the event types the paper engine emits; any type the
// engine adds later falls through to its raw value.
const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Created',
  ENTRY: 'Entry',
  SKIPPED_GAP: 'Skipped gap',
  SL: 'Stop loss',
  TP1: 'TP1',
  TP2: 'TP2',
  TRAIL: 'Trail',
  TIME: 'Time stop',
  RSI_EXIT: 'RSI exit',
  REBAL_EXIT: 'Rebalance exit',
  SLEEVE_EXIT: 'Sleeve exit',
}

// Entry tints primary, profit-taking exits green, loss/forced exits red — keeps
// the timeline scannable. Kept inline (not a shared helper) so the scanner
// slices stay decoupled.
function eventBadgeClass(type: string): string {
  switch (type) {
    case 'ENTRY':
      return 'bg-primary/10 text-primary border-transparent'
    case 'TP1':
    case 'TP2':
    case 'TRAIL':
      return 'bg-gain/10 text-gain border-transparent'
    case 'SL':
    case 'TIME':
    case 'RSI_EXIT':
    case 'REBAL_EXIT':
    case 'SLEEVE_EXIT':
    case 'SKIPPED_GAP':
      return 'bg-loss/10 text-loss border-transparent'
    default:
      return 'text-muted-foreground'
  }
}

// event.date (YYYY-MM-DD) is authoritative when present; the stub CREATED event
// only carries `at` (an ISO timestamp), which we format to IST.
function eventWhen(event: ScannerEvent): string {
  if (event.date) return event.date
  if (event.at) return formatIstDateTime(event.at)
  return '—'
}

export type EventLogProps = {
  events: ScannerEvent[]
}

export function EventLog({ events }: EventLogProps) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">No events yet</p>
  }

  return (
    <ol className="space-y-2">
      {events.map((event, i) => {
        const type = event.type || 'EVENT'
        const label = EVENT_LABELS[type] ?? type
        return (
          <li
            key={`${type}-${event.date ?? event.at ?? i}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-3 py-2"
          >
            <span className="text-muted-foreground w-32 shrink-0 text-xs tabular-nums">
              {eventWhen(event)}
            </span>
            <Badge variant="outline" className={eventBadgeClass(type)}>
              {label}
            </Badge>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
              {event.price != null ? (
                <span className="tabular-nums">
                  <span className="text-muted-foreground">Price </span>
                  {formatCurrency(event.price)}
                </span>
              ) : null}
              {event.qty != null ? (
                <span className="tabular-nums">
                  <span className="text-muted-foreground">Qty </span>
                  {formatInt(event.qty)}
                </span>
              ) : null}
              {event.gapPct != null ? (
                <span className="tabular-nums">
                  <span className="text-muted-foreground">Gap </span>
                  {event.gapPct.toFixed(2)}%
                </span>
              ) : null}
              {event.remainingRR != null ? (
                <span className="tabular-nums">
                  <span className="text-muted-foreground">Rem RR </span>
                  {event.remainingRR.toFixed(2)}
                </span>
              ) : null}
            </div>
            {event.note ? (
              <p className="text-muted-foreground w-full text-xs">{event.note}</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
