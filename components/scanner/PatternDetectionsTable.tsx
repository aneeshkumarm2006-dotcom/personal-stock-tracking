import Link from 'next/link'

import { cn } from '@/lib/utils'
import { formatCurrency, pnlColorClass } from '@/lib/format'
import {
  patternLabel,
  tierLabel,
  tierPlainLabel,
  tierTone,
} from '@/lib/scanner/patternMeta'
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
import type { PatternDetectionRow, ScannerPosition } from '@/lib/scanner/types'

const EXIT_REASON_LABELS: Record<string, string> = {
  SL: 'Stopped out',
  TP1: 'TP1 hit',
  TP2: 'TP2 hit',
  TRAIL: 'Trailed out',
  TIME: 'Time stop',
}

// The forward-test outcome of a detection, derived from its paper position.
function OutcomeCell({ position }: { position: ScannerPosition | null }) {
  if (!position) return <span className="text-muted-foreground">—</span>
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
  if (status === 'OPEN') return <Badge variant="secondary">Open</Badge>
  if (status === 'PENDING_ENTRY')
    return <Badge variant="outline">Pending entry</Badge>
  if (status === 'SKIPPED_GAP')
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Skipped · gap
      </Badge>
    )
  return <Badge variant="outline">{status}</Badge>
}

export function PatternDetectionsTable({
  detections,
}: {
  detections: PatternDetectionRow[]
}) {
  if (detections.length === 0) {
    return (
      <EmptyState
        title="No detections"
        description="No chart patterns were detected for this session."
      />
    )
  }

  // Tradable names first (the ones a human could act on), best shape first.
  const rows = [...detections].sort((a, b) => {
    if (a.tradable !== b.tradable) return a.tradable ? -1 : 1
    return (b.quality ?? 0) - (a.quality ?? 0)
  })

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table containerClassName="thin-scrollbar">
        <TableHeader>
          <TableRow>
            <TableHead>Stock</TableHead>
            <TableHead>Pattern</TableHead>
            <TableHead className="text-right">Quality</TableHead>
            <TableHead className="text-right">Buy above</TableHead>
            <TableHead className="text-right">Stop</TableHead>
            <TableHead className="text-right">Target</TableHead>
            <TableHead className="text-right" title="reward ÷ risk">
              R:R
            </TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => {
            const tl = tierPlainLabel(d.tier)
            return (
              <TableRow key={d.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/scanner/patterns/${encodeURIComponent(d.id)}`}
                    className="text-primary hover:underline"
                  >
                    {d.symbol}
                  </Link>
                  {!d.tradable ? (
                    <div className="text-muted-foreground text-[10px]">
                      untradable
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{patternLabel(d.strategy)}</span>
                    {tl ? (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          tierTone(d.tier),
                        )}
                        title={tierLabel(d.tier) ?? undefined}
                      >
                        {tl}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.quality}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.buy)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.sl)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.tp1)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {d.rr != null ? d.rr.toFixed(2) : '—'}
                </TableCell>
                <TableCell>
                  <OutcomeCell position={d.position} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
