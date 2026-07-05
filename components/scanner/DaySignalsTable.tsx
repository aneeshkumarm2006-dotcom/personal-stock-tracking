import Link from 'next/link'

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
import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'
import type { DaySignal, ScannerPosition } from '@/lib/scanner/types'

// Friendly labels for how a closed position exited. Falls back to the raw reason
// for any value the engine adds later (Record access is guarded with ?? below).
const EXIT_REASON_LABELS: Record<string, string> = {
  SL: 'Stopped out',
  TP1: 'TP1 hit',
  TP2: 'TP2 hit',
  TRAIL: 'Trailed out',
  TIME: 'Time stop',
  RSI_EXIT: 'RSI exit',
  REBAL_EXIT: 'Rebalanced',
  SLEEVE_EXIT: 'Sleeve exit',
}

// The outcome of a signal, derived entirely from its attached position. Null when
// no position doc exists yet (should be rare — the engine writes a stub per signal).
function OutcomeCell({ position }: { position: ScannerPosition | null }) {
  if (!position) {
    return <span className="text-muted-foreground">—</span>
  }

  const status = position.status

  if (status === 'CLOSED') {
    const net = position.netPnl ?? null
    const reason = position.exitReason ?? null
    const label = reason ? (EXIT_REASON_LABELS[reason] ?? reason) : 'Closed'
    const cls =
      net != null && net > 0
        ? 'bg-gain/10 text-gain border-transparent'
        : net != null && net < 0
          ? 'bg-loss/10 text-loss border-transparent'
          : 'text-muted-foreground'
    return (
      <div className="space-y-0.5">
        <Badge variant="outline" className={cls}>
          {label}
        </Badge>
        <div className="flex items-center gap-2 text-xs tabular-nums">
          <span className={pnlColorClass(net)}>
            {net != null ? formatCurrency(net) : '—'}
          </span>
          {position.rMultiple != null ? (
            <span className="text-muted-foreground">
              {position.rMultiple.toFixed(2)}R
            </span>
          ) : null}
        </div>
      </div>
    )
  }

  if (status === 'OPEN') {
    return <Badge variant="secondary">Open</Badge>
  }

  if (status === 'PENDING_ENTRY') {
    return <Badge variant="outline">Pending entry</Badge>
  }

  if (status === 'SKIPPED_GAP') {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Skipped · gap
      </Badge>
    )
  }

  return <Badge variant="outline">{status}</Badge>
}

export type DaySignalsTableProps = {
  signals: DaySignal[]
}

export function DaySignalsTable({ signals }: DaySignalsTableProps) {
  if (signals.length === 0) {
    return (
      <EmptyState
        title="No signals"
        description="No signals were published for this session."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table containerClassName="thin-scrollbar">
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">#</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Setup</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Buy</TableHead>
            <TableHead className="text-right">SL</TableHead>
            <TableHead className="text-right">TP1</TableHead>
            <TableHead className="text-right">TP2</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Flags</TableHead>
            <TableHead>Outcome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signals.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {s.rank}
              </TableCell>
              <TableCell className="font-medium">
                <Link
                  href={`/scanner/signals/${encodeURIComponent(s.id)}`}
                  className="text-primary hover:underline"
                >
                  {s.symbol}
                </Link>
                <div className="text-muted-foreground text-[11px] font-normal">
                  {s.strategy}
                </div>
              </TableCell>
              <TableCell className="text-xs">{s.setup}</TableCell>
              <TableCell className="text-right tabular-nums">
                {s.score.toFixed(1)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(s.buy)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(s.sl)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(s.tp1)}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {formatCurrency(s.tp2)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatInt(s.plannedQty)}
              </TableCell>
              <TableCell>
                {s.flags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {s.flags.map((f, i) => (
                      <Badge
                        key={`${s.id}-flag-${i}`}
                        variant="outline"
                        className="text-muted-foreground text-[10px]"
                      >
                        {f}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <OutcomeCell position={s.position} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
