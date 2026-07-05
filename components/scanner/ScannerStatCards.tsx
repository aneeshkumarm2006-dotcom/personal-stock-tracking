import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import type { OverviewData } from '@/lib/scanner/types'

export type ScannerStatCardsProps = {
  data: OverviewData
}

type Metric = {
  label: string
  value: string
  valueClass?: string
}

// winRate/avgR/profitFactor come from Mongo as fractions/ratios (or null when no
// closed trades yet) — format them defensively so a missing metric reads '—'.
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

export function ScannerStatCards({ data }: ScannerStatCardsProps) {
  const s = data.summary

  const metrics: Metric[] = [
    { label: 'Equity', value: formatCurrency(s?.equity) },
    {
      label: 'Realized P&L',
      value: formatCurrency(s?.totalRealizedNet),
      valueClass: pnlColorClass(s?.totalRealizedNet),
    },
    {
      label: 'Unrealized P&L',
      value: formatCurrency(s?.totalUnrealized),
      valueClass: pnlColorClass(s?.totalUnrealized),
    },
    { label: 'Win rate', value: formatFractionPct(s?.winRate) },
    { label: 'Avg R', value: formatR(s?.avgR) },
    { label: 'Profit factor', value: formatRatio(s?.profitFactor) },
    { label: 'Open positions', value: formatInt(data.openPositionsCount) },
    {
      // maxDrawdown is persisted as a non-negative magnitude (max peak-minus-equity),
      // so render it as a loss (negated) and colour it red whenever there has been any.
      label: 'Max drawdown',
      value:
        s?.maxDrawdown != null && s.maxDrawdown > 0
          ? `-${formatCurrency(s.maxDrawdown)}`
          : formatCurrency(s?.maxDrawdown),
      valueClass:
        s?.maxDrawdown != null && s.maxDrawdown > 0 ? 'text-loss' : undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((m) => (
        <Card key={m.label} size="sm">
          <CardContent>
            <p className="text-muted-foreground text-xs">{m.label}</p>
            <p
              className={cn(
                'mt-1 text-lg leading-tight font-semibold tracking-tight tabular-nums',
                m.valueClass
              )}
            >
              {m.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
