import { formatCurrency, pnlColorClass } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import type { IntradaySummary } from '@/lib/scanner/types'

// The swing tab's stat-card grid, for the intraday A/B experiment — every metric
// exists once per exit arm, so the cards pair up A|B across the row.

type Metric = {
  label: string
  value: string
  valueClass?: string
}

// Unlike the swing summary (fractions), the intraday stats doc stores winRate as
// an already-rounded percent and avgR as a ready-to-print ratio.
function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value}%`
}

function formatR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value}R`
}

export function IntradayStatCards({ summary }: { summary: IntradaySummary }) {
  const a = summary.byArm.A
  const b = summary.byArm.B

  const metrics: Metric[] = [
    { label: 'Equity · Exit A', value: formatCurrency(a.equity) },
    { label: 'Equity · Exit B', value: formatCurrency(b.equity) },
    {
      label: 'Net P&L · Exit A',
      value: formatCurrency(a.netPnl),
      valueClass: pnlColorClass(a.netPnl),
    },
    {
      label: 'Net P&L · Exit B',
      value: formatCurrency(b.netPnl),
      valueClass: pnlColorClass(b.netPnl),
    },
    { label: 'Win rate · Exit A', value: formatPct(a.winRate) },
    { label: 'Win rate · Exit B', value: formatPct(b.winRate) },
    { label: 'Avg R · Exit A', value: formatR(a.avgR) },
    { label: 'Avg R · Exit B', value: formatR(b.avgR) },
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
                m.valueClass,
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
