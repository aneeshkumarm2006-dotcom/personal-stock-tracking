import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercent, pnlColorClass } from '@/lib/format'
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

export function PortfolioSummaryCards({ summary }: PortfolioSummaryCardsProps) {
  const unrealizedPct =
    summary.totalInvested > 0
      ? Math.round((summary.totalUnrealizedPnL / summary.totalInvested) * 10000) / 100
      : 0

  const metrics: Metric[] = [
    { label: 'Total Invested', value: formatCurrency(summary.totalInvested) },
    { label: 'Current Value', value: formatCurrency(summary.totalCurrentValue) },
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
      label: 'Overall Return',
      value: formatPercent(summary.overallReturnPct),
      valueClass: pnlColorClass(summary.overallReturnPct),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {metrics.map((m) => (
        <Card key={m.label} size="sm">
          <CardHeader>
            <CardDescription>{m.label}</CardDescription>
            <CardTitle className={m.valueClass}>{m.value}</CardTitle>
          </CardHeader>
          {m.hint ? (
            <CardContent>
              <span className={`text-xs ${m.valueClass ?? 'text-muted-foreground'}`}>
                {m.hint}
              </span>
            </CardContent>
          ) : null}
        </Card>
      ))}
    </div>
  )
}
