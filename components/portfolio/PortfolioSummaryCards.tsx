import { formatCurrency, formatPercent, pnlColorClass } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PortfolioSummary } from '@/lib/portfolio/summary'

export type PortfolioSummaryCardsProps = {
  summary: PortfolioSummary
}

type Metric = {
  label: string
  value: string
  hint?: string
  valueClass?: string
}

/* Border map for a 2-col mobile / 5-col desktop strip of exactly 5 cells. */
const CELL_BORDERS = [
  'border-b border-r lg:border-b-0',
  'border-b lg:border-r lg:border-b-0',
  'border-b border-r lg:border-b-0',
  'border-b lg:border-r lg:border-b-0',
  'col-span-2 lg:col-span-1',
]

export function PortfolioSummaryCards({ summary }: PortfolioSummaryCardsProps) {
  const unrealizedPct =
    summary.totalInvested > 0
      ? Math.round((summary.totalUnrealizedPnL / summary.totalInvested) * 10000) / 100
      : 0

  const metrics: Metric[] = [
    { label: 'Total invested', value: formatCurrency(summary.totalInvested) },
    { label: 'Current value', value: formatCurrency(summary.totalCurrentValue) },
    {
      label: 'Unrealized P&L',
      value: formatCurrency(summary.totalUnrealizedPnL),
      hint: formatPercent(unrealizedPct),
      valueClass: pnlColorClass(summary.totalUnrealizedPnL),
    },
    {
      label: 'Realized P&L',
      value: formatCurrency(summary.totalRealizedPnL),
      valueClass: pnlColorClass(summary.totalRealizedPnL),
    },
    {
      label: 'Overall return',
      value: formatPercent(summary.overallReturnPct),
      valueClass: pnlColorClass(summary.overallReturnPct),
    },
  ]

  return (
    <dl className="bg-card ring-foreground/10 grid grid-cols-2 overflow-hidden rounded-xl ring-1 lg:grid-cols-5">
      {metrics.map((m, idx) => (
        <div key={m.label} className={cn('px-4 py-3.5', CELL_BORDERS[idx])}>
          <dt className="text-muted-foreground text-xs">{m.label}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            <span
              className={cn(
                'text-lg leading-tight font-semibold tracking-tight tabular-nums',
                m.valueClass
              )}
            >
              {m.value}
            </span>
            {m.hint ? (
              <span
                className={cn(
                  'text-xs font-medium tabular-nums',
                  m.valueClass ?? 'text-muted-foreground'
                )}
              >
                {m.hint}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}
