import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import type { PatternStatsSummary } from '@/lib/scanner/types'

// The swing tab's stat-card grid for the pattern forward test — every bucket's
// TRADABLE cohort pooled (the cohort that answers "could I have made money");
// the per-pattern split stays in the scoreboard below.

type Metric = {
  label: string
  value: string
  valueClass?: string
}

export function PatternStatCards({ summary }: { summary: PatternStatsSummary }) {
  let closed = 0
  let open = 0
  let wins = 0
  let rSum = 0
  let rClosed = 0
  let realized = 0
  let unrealized = 0
  let ready = 0
  for (const bucket of summary.buckets) {
    const t = bucket.tradable
    closed += t.closedTrades
    open += t.openTrades
    realized += t.totalRealizedNet
    unrealized += t.totalUnrealized
    if (t.winRate != null) wins += t.winRate * t.closedTrades
    if (t.avgR != null) {
      rSum += t.avgR * t.closedTrades
      rClosed += t.closedTrades
    }
    if (t.status === 'ready') ready += 1
  }
  const winRate = closed > 0 ? wins / closed : null
  const avgR = rClosed > 0 ? rSum / rClosed : null
  const patternCount = summary.bucketCount || summary.buckets.length

  const metrics: Metric[] = [
    {
      label: 'Realized P&L',
      value: formatCurrency(realized),
      valueClass: pnlColorClass(realized),
    },
    {
      label: 'Unrealized P&L',
      value: formatCurrency(unrealized),
      valueClass: pnlColorClass(unrealized),
    },
    {
      label: 'Win rate',
      value: winRate != null ? `${(winRate * 100).toFixed(1)}%` : '—',
    },
    { label: 'Avg R', value: avgR != null ? `${avgR.toFixed(2)}R` : '—' },
    { label: 'Closed trades', value: formatInt(closed) },
    { label: 'Open trades', value: formatInt(open) },
    { label: 'Patterns tracked', value: formatInt(patternCount) },
    { label: 'Verdicts ready', value: `${formatInt(ready)} of ${formatInt(patternCount)}` },
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
