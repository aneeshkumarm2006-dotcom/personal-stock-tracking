'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompact, formatCurrency, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DepthLevel, Quote } from './types'

export type MarketDepthCardProps = {
  quote: Quote | undefined
  isLoading: boolean
  isError: boolean
}

function DepthSide({
  levels,
  side,
}: {
  levels: DepthLevel[]
  side: 'buy' | 'sell'
}) {
  const isBuy = side === 'buy'
  // Shade each row proportionally to its quantity, so the ladder reads at a glance.
  const maxQty = levels.reduce((m, l) => Math.max(m, l.quantity), 0) || 1

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'grid grid-cols-[1fr_auto_auto] gap-3 px-2 text-xs font-medium',
          isBuy ? 'text-gain' : 'text-loss',
        )}
      >
        <span>{isBuy ? 'Bid' : 'Ask'}</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Orders</span>
      </div>
      {levels.map((l, i) => (
        <div
          key={i}
          className="relative grid grid-cols-[1fr_auto_auto] gap-3 rounded px-2 py-1 text-xs tabular-nums"
        >
          <span
            className={cn(
              'absolute inset-y-0 rounded',
              isBuy ? 'right-0 bg-gain/10' : 'left-0 bg-loss/10',
            )}
            style={{ width: `${(l.quantity / maxQty) * 100}%` }}
            aria-hidden="true"
          />
          <span className="relative font-medium">{formatCurrency(l.price)}</span>
          <span className="relative text-right">{formatInt(l.quantity)}</span>
          <span className="relative text-muted-foreground text-right">
            {formatInt(l.orders)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function MarketDepthCard({ quote, isLoading, isError }: MarketDepthCardProps) {
  const depth = quote?.depth
  const hasDepth =
    depth && (depth.buy.length > 0 || depth.sell.length > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market depth</CardTitle>
        <CardDescription>Best 5 bids and asks (live order book)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!quote && isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : !quote && isError ? (
          <ErrorState message="Couldn’t load the order book." />
        ) : !hasDepth ? (
          <EmptyState
            className="min-h-32"
            description="No live order book — depth shows during market hours (indices have none)."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <DepthSide levels={depth!.buy} side="buy" />
              <DepthSide levels={depth!.sell} side="sell" />
            </div>
            <div className="text-muted-foreground flex items-center justify-between border-t pt-3 text-xs tabular-nums">
              <span>
                Total buy{' '}
                <span className="text-gain font-medium">
                  {formatCompact(quote?.totalBuyQty)}
                </span>
              </span>
              <span>
                Total sell{' '}
                <span className="text-loss font-medium">
                  {formatCompact(quote?.totalSellQty)}
                </span>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
