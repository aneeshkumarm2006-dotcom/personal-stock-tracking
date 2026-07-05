import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import type { TradeBlock } from '@/lib/scanner/types'

export type PerStrategyTableProps = {
  byStrategy: Record<string, TradeBlock>
}

type StrategyRow = { strategy: string } & TradeBlock

// winRate is a fraction (0..1); avgR / profitFactor are ratios that may be null
// when there are no closed trades (or no losses) yet.
function formatFractionPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(1)}%`
}

function formatR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(2)}R`
}

function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(2)
}

export function PerStrategyTable({ byStrategy }: PerStrategyTableProps) {
  const rows: StrategyRow[] = Object.entries(byStrategy)
    .map(([strategy, block]) => ({ strategy, ...block }))
    .sort((a, b) => (a.strategy < b.strategy ? -1 : a.strategy > b.strategy ? 1 : 0))

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No strategy stats yet"
        description="Per-strategy performance appears once trades start closing."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table containerClassName="thin-scrollbar">
        <TableHeader>
          <TableRow>
            <TableHead>Strategy</TableHead>
            <TableHead className="text-right">Closed</TableHead>
            <TableHead className="text-right">Open</TableHead>
            <TableHead className="text-right">Win rate</TableHead>
            <TableHead className="text-right">Avg R</TableHead>
            <TableHead className="text-right">Profit factor</TableHead>
            <TableHead className="text-right">Realized</TableHead>
            <TableHead className="text-right">Unrealized</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.strategy}>
              <TableCell className="font-medium">{row.strategy}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatInt(row.closedTrades)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatInt(row.openTrades)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatFractionPct(row.winRate)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatR(row.avgR)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRatio(row.profitFactor)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  pnlColorClass(row.totalRealizedNet)
                )}
              >
                {formatCurrency(row.totalRealizedNet)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  pnlColorClass(row.totalUnrealized)
                )}
              >
                {formatCurrency(row.totalUnrealized)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
