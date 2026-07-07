import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'
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
import type { ScannerPosition } from '@/lib/scanner/types'

export type ScannerLevelsTableProps = {
  positions: ScannerPosition[]
}

type StatusDisplay = {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
}

// The trade levels & derived economics for one position, computed off the planned
// buy price (falling back to the filled entry). Risk/reward/R:R mirror the strategy
// EntriesTable definitions so the two tables read identically.
type Derived = {
  entry: number | null
  qty: number | null
  capital: number | null
  risk: number | null
  reward: number | null
  rr: number | null
  current: number | null
  pnl: number | null
}

function derive(p: ScannerPosition): Derived {
  const entry = p.buy ?? p.entryPrice ?? null
  const qty = p.qty ?? p.plannedQty ?? null
  const capital = entry !== null && qty !== null ? entry * qty : null
  const perShareRisk = entry !== null && p.sl != null ? entry - p.sl : null
  const perShareReward = entry !== null && p.tp1 != null ? p.tp1 - entry : null
  const risk = perShareRisk !== null && qty !== null ? perShareRisk * qty : null
  const reward = perShareReward !== null && qty !== null ? perShareReward * qty : null
  const rr =
    perShareRisk !== null && perShareReward !== null && perShareRisk > 0
      ? perShareReward / perShareRisk
      : null
  const current =
    p.status === 'CLOSED' ? (p.exitPrice ?? null) : (p.lastMark?.close ?? null)
  const pnl =
    p.status === 'CLOSED'
      ? (p.netPnl ?? null)
      : p.status === 'OPEN'
        ? (p.lastMark?.unrealizedPnl ?? null)
        : null
  return { entry, qty, capital, risk, reward, rr, current, pnl }
}

// Maps a position's status (and exit reason) to a coloured badge in the same
// visual language as the strategy table's "Running +x%", "SL hit", "TP hit".
function statusDisplay(p: ScannerPosition, pnl: number | null): StatusDisplay {
  const runningPct = (): { label: string; className: string } => {
    const capital = (p.buy ?? p.entryPrice ?? 0) * (p.qty ?? p.plannedQty ?? 0)
    const pct = capital > 0 && pnl !== null ? (pnl / capital) * 100 : 0
    const sign = pct >= 0 ? '+' : ''
    return {
      label: `${sign}${pct.toFixed(2)}%`,
      className: pct >= 0 ? 'text-gain' : 'text-loss',
    }
  }

  switch (p.status) {
    case 'PENDING_ENTRY':
      return { label: 'Waiting · fill', variant: 'outline' }
    case 'OPEN': {
      const r = runningPct()
      return { label: `Running ${r.label}`, variant: 'outline', className: r.className }
    }
    case 'SKIPPED_GAP':
      return {
        label: 'Skipped gap',
        variant: 'outline',
        className: 'text-muted-foreground',
      }
    case 'CLOSED': {
      switch (p.exitReason) {
        case 'SL':
          return {
            label: 'SL hit',
            variant: 'outline',
            className: 'bg-loss/10 text-loss border-transparent',
          }
        case 'TP1':
        case 'TP2':
          return {
            label: 'TP hit',
            variant: 'outline',
            className: 'bg-gain/10 text-gain border-transparent',
          }
        case 'TRAIL':
          return {
            label: 'Trail exit',
            variant: 'outline',
            className: 'bg-gain/10 text-gain border-transparent',
          }
        case 'TIME':
          return { label: 'Time exit', variant: 'outline' }
        case 'RSI_EXIT':
          return { label: 'RSI exit', variant: 'outline' }
        case 'REBAL_EXIT':
          return { label: 'Rebalance exit', variant: 'outline' }
        case 'SLEEVE_EXIT':
          return { label: 'Sleeve exit', variant: 'outline' }
        default:
          return { label: 'Closed', variant: 'outline' }
      }
    }
    default:
      return { label: p.status || '—', variant: 'outline' }
  }
}

export function ScannerLevelsTable({ positions }: ScannerLevelsTableProps) {
  if (positions.length === 0) {
    return (
      <EmptyState
        title="No positions yet"
        description="Trade levels appear here once the scanner has generated signals."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table containerClassName="thin-scrollbar">
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">SL</TableHead>
            <TableHead className="text-right">TP1</TableHead>
            <TableHead className="text-right">TP2</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Capital</TableHead>
            <TableHead className="text-right">Risk</TableHead>
            <TableHead className="text-right">Reward</TableHead>
            <TableHead className="text-right">R:R</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">P&amp;L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((p) => {
            const d = derive(p)
            const status = statusDisplay(p, d.pnl)
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.symbol || p.token || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.entry)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(p.sl)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(p.tp1)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {p.tp2 != null ? formatCurrency(p.tp2) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatInt(d.qty)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.capital)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.risk)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.reward)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.rr !== null ? d.rr.toFixed(2) : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.current)}
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant} className={status.className}>
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className={`text-right tabular-nums ${pnlColorClass(d.pnl)}`}>
                  {d.pnl !== null ? formatCurrency(d.pnl) : '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
