'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompact, formatCurrency, formatPercent, pnlColorClass } from '@/lib/format'
import type { ResearchAnalytics } from '@/lib/research/analytics'
import { cn } from '@/lib/utils'
import type { Quote } from './types'

export type TechnicalsCardProps = {
  analytics: ResearchAnalytics
  quote: Quote | undefined
  isLoading: boolean
}

function ReturnCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={cn('mt-0.5 text-sm font-semibold tabular-nums', pnlColorClass(value))}>
        {value === null ? '—' : formatPercent(value)}
      </div>
    </div>
  )
}

function MovingAverage({
  label,
  sma,
  reference,
}: {
  label: string
  sma: number | null
  reference: number | undefined
}) {
  const diff = sma !== null && reference !== undefined ? reference - sma : null
  return (
    <div className="px-3 py-2.5">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tabular-nums">{formatCurrency(sma)}</span>
        {diff !== null && (
          <span className={cn('text-xs font-medium', pnlColorClass(diff))}>
            {diff >= 0 ? 'above' : 'below'}
          </span>
        )}
      </div>
    </div>
  )
}

export function TechnicalsCard({ analytics, quote, isLoading }: TechnicalsCardProps) {
  const reference = quote?.ltp ?? analytics.lastClose ?? undefined

  // 52-week position: prefer the live quote's range, fall back to the computed one.
  const low52 = quote?.week52Low ?? analytics.low52w ?? undefined
  const high52 = quote?.week52High ?? analytics.high52w ?? undefined
  const pos52 =
    low52 !== undefined && high52 !== undefined && reference !== undefined && high52 > low52
      ? ((reference - low52) / (high52 - low52)) * 100
      : null

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance &amp; technicals</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    )
  }

  const technicals: Array<{ label: string; value: string; className?: string }> = [
    {
      label: 'Volatility (annualized)',
      value: analytics.annualizedVolatility === null ? '—' : formatPercent(analytics.annualizedVolatility),
    },
    {
      label: 'Max drawdown (1Y)',
      value: analytics.maxDrawdown1Y === null ? '—' : formatPercent(analytics.maxDrawdown1Y),
      className: pnlColorClass(analytics.maxDrawdown1Y),
    },
    {
      label: '52-week position',
      value: pos52 === null ? '—' : `${pos52.toFixed(0)}%`,
    },
    {
      label: 'Avg volume (20d)',
      value: formatCompact(analytics.avgVolume20d),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance &amp; technicals</CardTitle>
        <CardDescription>
          Computed from daily price history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium">Trailing returns</h3>
          <div className="ring-foreground/10 grid grid-cols-3 overflow-hidden rounded-lg ring-1 sm:grid-cols-6 [&>div]:border-b [&>div]:border-r">
            <ReturnCell label="1W" value={analytics.return1W} />
            <ReturnCell label="1M" value={analytics.return1M} />
            <ReturnCell label="3M" value={analytics.return3M} />
            <ReturnCell label="6M" value={analytics.return6M} />
            <ReturnCell label="YTD" value={analytics.returnYTD} />
            <ReturnCell label="1Y" value={analytics.return1Y} />
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium">Moving averages</h3>
          <div className="ring-foreground/10 grid grid-cols-3 overflow-hidden rounded-lg ring-1 [&>div]:border-b [&>div]:border-r">
            <MovingAverage label="SMA 20" sma={analytics.sma20} reference={reference} />
            <MovingAverage label="SMA 50" sma={analytics.sma50} reference={reference} />
            <MovingAverage label="SMA 200" sma={analytics.sma200} reference={reference} />
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium">Risk &amp; range</h3>
          <div className="ring-foreground/10 grid grid-cols-2 overflow-hidden rounded-lg ring-1 sm:grid-cols-4 [&>div]:border-b [&>div]:border-r">
            {technicals.map((t) => (
              <div key={t.label} className="px-3 py-2.5">
                <div className="text-muted-foreground text-xs">{t.label}</div>
                <div className={cn('mt-0.5 text-sm font-semibold tabular-nums', t.className)}>
                  {t.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
