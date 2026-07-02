'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from 'recharts'

import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { axisProps, formatAxisInr, gridProps } from '@/components/charts/chartTheme'
import { formatCompact, formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CandleRow } from './types'

type RangeKey = '1D' | '1M' | '3M' | '6M' | '1Y' | '5Y'
type ChartType = 'line' | 'candles'

const RANGE_DAYS: Record<Exclude<RangeKey, '1D'>, number> = {
  '1M': 30,
  '3M': 91,
  '6M': 182,
  '1Y': 365,
  '5Y': 1825,
}

const RANGES: RangeKey[] = ['1D', '1M', '3M', '6M', '1Y', '5Y']

type ChartPoint = {
  label: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

async function fetchIntraday(
  token: string,
  exchange: 'NSE' | 'BSE',
): Promise<CandleRow[]> {
  // Pull a few days of 5-minute candles, then keep only the most recent session
  // so weekends/holidays still show the latest available intraday day.
  const to = new Date()
  const from = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    exchange,
    interval: 'FIVE_MINUTE',
    from: from.toISOString(),
    to: to.toISOString(),
  })
  const res = await fetch(
    `/api/historical/${encodeURIComponent(token)}?${params.toString()}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as CandleRow[]
  return Array.isArray(data) ? data : []
}

function lastSession(candles: CandleRow[]): CandleRow[] {
  const lastCandle = candles[candles.length - 1]
  if (!lastCandle) return []
  const lastDay = new Date(lastCandle.timestamp).toISOString().slice(0, 10)
  return candles.filter((c) => c.timestamp.slice(0, 10) === lastDay)
}

function toPoint(label: string, c: CandleRow): ChartPoint {
  return {
    label,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }
}

/**
 * Draws the candlesticks as an SVG overlay using the chart's own scales (via
 * Recharts v3 axis-scale hooks), so each candle sits centred on its category
 * band — independent of the volume <Bar>, which Recharts would otherwise
 * cluster a second price <Bar> against. Rendered as a direct child of the
 * chart so the hooks resolve against its context.
 */
function CandleLayer({ points }: { points: ChartPoint[] }) {
  const xScale = useXAxisScale(0)
  const yScale = useYAxisScale('price')
  if (!xScale || !yScale) return null

  // Band width for the candle body: band scales expose start/end positions;
  // point scales collapse them, so fall back to the gap between neighbours.
  const centerOf = (label: string) => xScale(label, { position: 'middle' })
  let bandWidth = 0
  const firstPoint = points[0]
  if (firstPoint) {
    const start = xScale(firstPoint.label, { position: 'start' })
    const end = xScale(firstPoint.label, { position: 'end' })
    if (start != null && end != null) bandWidth = Math.abs(end - start)
  }
  const secondPoint = points[1]
  if (bandWidth === 0 && firstPoint && secondPoint) {
    const a = centerOf(firstPoint.label)
    const b = centerOf(secondPoint.label)
    if (a != null && b != null) bandWidth = Math.abs(b - a)
  }
  const candleWidth = Math.max(bandWidth * 0.62, 1)

  return (
    <g>
      {points.map((p) => {
        const centerX = centerOf(p.label)
        const highY = yScale(p.high)
        const lowY = yScale(p.low)
        const openY = yScale(p.open)
        const closeY = yScale(p.close)
        if (
          centerX == null ||
          highY == null ||
          lowY == null ||
          openY == null ||
          closeY == null
        ) {
          return null
        }
        const up = p.close >= p.open
        const color = up ? 'var(--gain)' : 'var(--loss)'
        const bodyTop = Math.min(openY, closeY)
        const bodyHeight = Math.max(Math.abs(closeY - openY), 1)
        return (
          <g key={p.label}>
            <line
              x1={centerX}
              y1={highY}
              x2={centerX}
              y2={lowY}
              stroke={color}
              strokeWidth={1}
            />
            <rect
              x={centerX - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              fill={color}
            />
          </g>
        )
      })}
    </g>
  )
}

type ChartTooltipProps = {
  active?: boolean
  payload?: Array<{ payload: ChartPoint }>
  chartType: ChartType
}

function ChartTooltip({ active, payload, chartType }: ChartTooltipProps) {
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  return (
    <div
      style={{
        backgroundColor: 'var(--popover)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: 12,
        padding: '8px 10px',
      }}
    >
      <div style={{ color: 'var(--muted-foreground)', fontSize: 11, marginBottom: 4 }}>
        {p.label}
      </div>
      {chartType === 'candles' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '1px 12px' }}>
          <span style={{ color: 'var(--muted-foreground)' }}>Open</span>
          <span style={{ textAlign: 'right' }}>{formatCurrency(p.open)}</span>
          <span style={{ color: 'var(--muted-foreground)' }}>High</span>
          <span style={{ textAlign: 'right' }}>{formatCurrency(p.high)}</span>
          <span style={{ color: 'var(--muted-foreground)' }}>Low</span>
          <span style={{ textAlign: 'right' }}>{formatCurrency(p.low)}</span>
          <span style={{ color: 'var(--muted-foreground)' }}>Close</span>
          <span style={{ textAlign: 'right' }}>{formatCurrency(p.close)}</span>
        </div>
      ) : (
        <div>{formatCurrency(p.close)}</div>
      )}
      {p.volume > 0 && (
        <div style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>
          Vol {formatCompact(p.volume)}
        </div>
      )}
    </div>
  )
}

export type ResearchPriceChartProps = {
  token: string
  exchange: 'NSE' | 'BSE'
  dailyCandles: CandleRow[]
  dailyLoading: boolean
  dailyError: boolean
}

export function ResearchPriceChart({
  token,
  exchange,
  dailyCandles,
  dailyLoading,
  dailyError,
}: ResearchPriceChartProps) {
  const [range, setRange] = useState<RangeKey>('6M')
  const [chartType, setChartType] = useState<ChartType>('line')

  const intradayQuery = useQuery({
    queryKey: ['research-intraday', token, exchange],
    queryFn: () => fetchIntraday(token, exchange),
    enabled: range === '1D',
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const points: ChartPoint[] = useMemo(() => {
    if (range === '1D') {
      return lastSession(intradayQuery.data ?? []).map((c) =>
        toPoint(
          new Date(c.timestamp).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Kolkata',
          }),
          c,
        ),
      )
    }
    const days = RANGE_DAYS[range]
    // Slice relative to the most recent candle (pure) rather than wall-clock time,
    // so the window is data-driven and the memo stays idempotent across renders.
    const lastCandle = dailyCandles[dailyCandles.length - 1]
    if (!lastCandle) return []
    const cutoff =
      new Date(lastCandle.timestamp).getTime() - days * 24 * 60 * 60 * 1000
    return dailyCandles
      .filter((c) => new Date(c.timestamp).getTime() >= cutoff)
      .map((c) =>
        // Daily candles are stamped at IST midnight but serialized as UTC, so a
        // raw slice(0,10) would read back one calendar day early — format in IST.
        toPoint(formatInTimeZone(new Date(c.timestamp), 'Asia/Kolkata', 'yyyy-MM-dd'), c),
      )
  }, [range, dailyCandles, intradayQuery.data])

  const isLoading = range === '1D' ? intradayQuery.isLoading : dailyLoading
  const isError = range === '1D' ? intradayQuery.isError : dailyError

  // Direction colour for the visible window (green when it ends higher).
  const first = points[0]?.close
  const last = points[points.length - 1]?.close
  const up = first !== undefined && last !== undefined ? last >= first : true
  const stroke = up ? 'var(--gain)' : 'var(--loss)'

  // Scale volume bars into the bottom ~25% of the plot so they stay subordinate.
  const maxVolume = points.reduce((m, p) => Math.max(m, p.volume), 0)
  const hasVolume = maxVolume > 0

  // Candles are drawn in the <CandleLayer> overlay, which isn't a data series,
  // so the price axis has nothing to auto-scale from — derive an explicit
  // domain from the high/low extremes (with a little breathing room).
  const priceDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (chartType !== 'candles' || points.length === 0) return ['auto', 'auto']
    let min = Infinity
    let max = -Infinity
    for (const p of points) {
      if (p.low < min) min = p.low
      if (p.high > max) max = p.high
    }
    const pad = (max - min) * 0.05 || max * 0.05 || 1
    return [min - pad, max + pad]
  }, [chartType, points])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Chart range"
          className="bg-muted inline-flex items-center gap-0.5 rounded-lg p-0.5"
        >
          {RANGES.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === range}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none',
                'focus-visible:ring-ring/50 focus-visible:ring-2',
                key === range
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setRange(key)}
            >
              {key}
            </button>
          ))}
        </div>

        <div
          role="group"
          aria-label="Chart type"
          className="bg-muted inline-flex items-center gap-0.5 rounded-lg p-0.5"
        >
          {(['line', 'candles'] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={type === chartType}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors outline-none',
                'focus-visible:ring-ring/50 focus-visible:ring-2',
                type === chartType
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setChartType(type)}
            >
              {type === 'line' ? 'Line' : 'Candles'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-[360px] w-full" />
      ) : isError ? (
        <ErrorState className="h-[360px]" message="Unable to load price history." />
      ) : points.length === 0 ? (
        <EmptyState
          className="h-[360px] min-h-0"
          description={
            range === '1D'
              ? 'No intraday data available for the latest session.'
              : 'No price data for this range.'
          }
        />
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="research-price-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} minTickGap={40} />
            <YAxis
              yAxisId="price"
              {...axisProps}
              domain={priceDomain}
              tickFormatter={formatAxisInr}
              width={52}
            />
            <YAxis
              yAxisId="volume"
              hide
              domain={[0, hasVolume ? maxVolume * 4 : 1]}
            />
            <Tooltip content={<ChartTooltip chartType={chartType} />} />
            {hasVolume && (
              <Bar
                yAxisId="volume"
                dataKey="volume"
                name="Volume"
                fill="var(--muted-foreground)"
                opacity={0.25}
                isAnimationActive={false}
              />
            )}
            {chartType === 'candles' ? (
              <>
                {/* Transparent series purely to power tooltip hit-testing —
                    the visible candles are drawn by the <CandleLayer> overlay. */}
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="close"
                  name="Close"
                  stroke="transparent"
                  fill="transparent"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
                <CandleLayer points={points} />
              </>
            ) : (
              <Area
                yAxisId="price"
                type="monotone"
                dataKey="close"
                name="Close"
                stroke={stroke}
                strokeWidth={1.6}
                fill="url(#research-price-fill)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
