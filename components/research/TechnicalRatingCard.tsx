'use client'

import { useMemo, useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  computeTechnicalRating,
  resampleCandles,
  type GroupRating,
  type IndicatorResult,
  type Timeframe,
  type Vote,
} from '@/lib/research/technicalRating'
import { cn } from '@/lib/utils'
import { fmtNum } from './fundamentals/format'
import { RatingGauge } from './RatingGauge'
import type { CandleRow } from './types'

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M']
const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  '1D': 'Daily',
  '1W': 'Weekly',
  '1M': 'Monthly',
}

// Below this many bars on the chosen timeframe, too many indicators are n/a for a
// meaningful summary (the trend filter alone needs 50). Surface a note instead of
// a thin, misleading gauge.
const MIN_BARS = 35

function voteClass(vote: Vote | null): string {
  if (vote === 'buy') return 'text-gain'
  if (vote === 'sell') return 'text-loss'
  return 'text-muted-foreground'
}

function voteLabel(vote: Vote | null): string {
  if (vote === 'buy') return 'Buy'
  if (vote === 'sell') return 'Sell'
  if (vote === 'neutral') return 'Neutral'
  return '—'
}

function IndicatorTable({ title, group }: { title: string; group: GroupRating }) {
  return (
    <div className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      <div className="ring-foreground/10 overflow-hidden rounded-lg ring-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-foreground/10 text-muted-foreground border-b text-xs font-medium">
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-foreground/10 divide-y tabular-nums">
            {group.indicators.map((ind: IndicatorResult) => (
              <tr key={ind.name}>
                <td className="px-3 py-2 text-left whitespace-normal">{ind.name}</td>
                <td className="px-3 py-2 text-right">{fmtNum(ind.value, 2)}</td>
                <td className={cn('px-3 py-2 text-right font-medium', voteClass(ind.vote))}>
                  {voteLabel(ind.vote)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export type TechnicalRatingCardProps = {
  candles: CandleRow[]
  isLoading: boolean
  isError: boolean
}

export function TechnicalRatingCard({ candles, isLoading, isError }: TechnicalRatingCardProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D')

  const rating = useMemo(() => {
    const resampled = resampleCandles(candles, timeframe)
    return computeTechnicalRating(resampled)
  }, [candles, timeframe])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Technical rating</CardTitle>
            <CardDescription>
              A TradingView-style buy/sell signal from {rating.movingAverages.indicators.length || 15}{' '}
              moving averages and {rating.oscillators.indicators.length || 11} oscillators, computed
              from price history.
            </CardDescription>
          </div>
          <div
            role="group"
            aria-label="Rating timeframe"
            className="bg-muted inline-flex items-center gap-0.5 rounded-lg p-0.5"
          >
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                aria-pressed={tf === timeframe}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none',
                  'focus-visible:ring-ring/50 focus-visible:ring-2',
                  tf === timeframe
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : isError ? (
          <ErrorState message="Unable to load price history for the technical rating." />
        ) : rating.summary.score === null || rating.candleCount < MIN_BARS ? (
          <EmptyState
            description={`Not enough ${TIMEFRAME_LABEL[timeframe].toLowerCase()} history to compute a rating. Try a shorter timeframe.`}
          />
        ) : (
          <div className="space-y-8">
            <div className="grid items-end gap-6 sm:grid-cols-3">
              <RatingGauge
                title="Oscillators"
                score={rating.oscillators.score}
                signal={rating.oscillators.signal}
                buy={rating.oscillators.buy}
                neutral={rating.oscillators.neutral}
                sell={rating.oscillators.sell}
              />
              <RatingGauge
                title="Summary"
                score={rating.summary.score}
                signal={rating.summary.signal}
                buy={rating.summary.buy}
                neutral={rating.summary.neutral}
                sell={rating.summary.sell}
                emphasis
              />
              <RatingGauge
                title="Moving averages"
                score={rating.movingAverages.score}
                signal={rating.movingAverages.signal}
                buy={rating.movingAverages.buy}
                neutral={rating.movingAverages.neutral}
                sell={rating.movingAverages.sell}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <IndicatorTable title="Oscillators" group={rating.oscillators} />
              <IndicatorTable title="Moving averages" group={rating.movingAverages} />
            </div>

            <p className="text-muted-foreground text-xs">
              Computed from {rating.candleCount} {TIMEFRAME_LABEL[timeframe].toLowerCase()} candles
              using TradingView&apos;s technical-ratings methodology. Not investment advice.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
