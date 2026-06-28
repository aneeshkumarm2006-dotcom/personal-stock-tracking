'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompact, formatCurrency, formatInt } from '@/lib/format'
import type { Quote } from './types'

export type QuoteStatsProps = {
  quote: Quote | undefined
  isLoading: boolean
  isError: boolean
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
    </div>
  )
}

// A horizontal track with a marker showing where `value` sits between `low` and
// `high` — used for the intraday day range and the 52-week range.
function RangeBar({
  label,
  low,
  high,
  value,
}: {
  label: string
  low: number | undefined
  high: number | undefined
  value: number | undefined
}) {
  const ready =
    low !== undefined &&
    high !== undefined &&
    value !== undefined &&
    high > low
  const pct = ready ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : 0

  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>{label}</span>
        {ready && <span className="tabular-nums">{pct.toFixed(0)}%</span>}
      </div>
      <div className="bg-muted relative h-1.5 w-full rounded-full">
        {ready && (
          <span
            className="bg-foreground absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
            style={{ left: `${pct}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span className="text-muted-foreground">{formatCurrency(low)}</span>
        <span className="text-muted-foreground">{formatCurrency(high)}</span>
      </div>
    </div>
  )
}

export function QuoteStats({ quote, isLoading, isError }: QuoteStatsProps) {
  if (!quote && (isLoading || isError)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Key statistics</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <ErrorState message="Couldn’t load this quote." />
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
        </CardContent>
      </Card>
    )
  }

  if (!quote) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Key statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState description="No quote available." />
        </CardContent>
      </Card>
    )
  }

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Open', value: formatCurrency(quote?.open) },
    { label: 'High', value: formatCurrency(quote?.high) },
    { label: 'Low', value: formatCurrency(quote?.low) },
    { label: 'Prev close', value: formatCurrency(quote?.close) },
    { label: 'Avg price (VWAP)', value: formatCurrency(quote?.avgPrice) },
    { label: 'Last trade qty', value: formatInt(quote?.lastTradeQty) },
    { label: 'Volume', value: formatCompact(quote?.tradeVolume) },
    { label: 'Total buy qty', value: formatCompact(quote?.totalBuyQty) },
    { label: 'Total sell qty', value: formatCompact(quote?.totalSellQty) },
    { label: 'Upper circuit', value: formatCurrency(quote?.upperCircuit) },
    { label: 'Lower circuit', value: formatCurrency(quote?.lowerCircuit) },
  ]
  // Open interest only matters for F&O; show it only when populated.
  if (quote?.openInterest && quote.openInterest > 0) {
    stats.push({ label: 'Open interest', value: formatCompact(quote.openInterest) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="ring-foreground/10 grid grid-cols-2 overflow-hidden rounded-lg ring-1 sm:grid-cols-3 [&>div]:border-b [&>div]:border-r">
          {stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} />
          ))}
          {/* Pad to a multiple of 6 (LCM of the 2- and 3-column layouts) so the
              last row is never ragged and no cell draws a dangling border. */}
          {Array.from({ length: (6 - (stats.length % 6)) % 6 }).map((_, i) => (
            <div key={`filler-${i}`} aria-hidden="true" />
          ))}
        </dl>

        <div className="grid gap-5 sm:grid-cols-2">
          <RangeBar
            label="Day range"
            low={quote?.low}
            high={quote?.high}
            value={quote?.ltp}
          />
          <RangeBar
            label="52-week range"
            low={quote?.week52Low}
            high={quote?.week52High}
            value={quote?.ltp}
          />
        </div>
      </CardContent>
    </Card>
  )
}
