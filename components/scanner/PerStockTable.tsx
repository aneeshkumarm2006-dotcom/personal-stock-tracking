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
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { StockBlock } from '@/lib/scanner/types'

export type PerStockTableProps = {
  byStock: StockBlock[]
}

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

function statusBadge(active: boolean) {
  return active ? (
    <Badge className="bg-gain/10 text-gain border-transparent">Active</Badge>
  ) : (
    <Badge className="bg-muted text-muted-foreground border-transparent">Closed</Badge>
  )
}

export function PerStockTable({ byStock }: PerStockTableProps) {
  if (byStock.length === 0) {
    return (
      <EmptyState
        title="No stock stats yet"
        description="Per-stock performance appears once positions are created."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table containerClassName="thin-scrollbar">
        <TableHeader>
          <TableRow>
            <TableHead>Stock</TableHead>
            <TableHead>Status</TableHead>
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
          {byStock.map((row) => (
            <TableRow key={row.symbol}>
              <TableCell className="font-medium">{row.symbol}</TableCell>
              <TableCell>{statusBadge(row.active)}</TableCell>
              <TableCell className="text-muted-foreground">
                {row.strategies.length > 0 ? row.strategies.join(', ') : '—'}
              </TableCell>
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
