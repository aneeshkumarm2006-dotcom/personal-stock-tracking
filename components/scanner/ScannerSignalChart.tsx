'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceDot,
  ReferenceLine,
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

// Local (client-safe) mirror of the candles the route returns — deliberately not
// importing any server module. Timestamps are ISO strings.
type CandleRow = {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type ChartPoint = {
  label: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

async function fetchCandles(signalId: string): Promise<CandleRow[]> {
  const res = await fetch(
    `/api/scanner/signals/${encodeURIComponent(signalId)}/candles`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`Candles failed (${res.status})`)
  const data = (await res.json()) as CandleRow[]
  return Array.isArray(data) ? data : []
}

// Snap a YYYY-MM-DD trade date to the nearest available candle label so an entry
// or exit marker lands on a real category band even across weekends/holidays.
function snapLabel(target: string | null, labels: string[]): string | null {
  if (!target) return null
  if (labels.includes(target)) return target
  const t = new Date(target).getTime()
  if (Number.isNaN(t)) return null
  let best: string | null = null
  let bestDiff = Infinity
  for (const l of labels) {
    const diff = Math.abs(new Date(l).getTime() - t)
    if (diff < bestDiff) {
      bestDiff = diff
      best = l
    }
  }
  return best
}

/**
 * SVG-overlay candlesticks (Recharts has no native candlestick). Lifted from
 * ResearchPriceChart: draws each candle centred on its category band using the
 * chart's own axis-scale hooks, so it stays aligned with the volume <Bar> and the
 * reference lines. Must be a direct child of <ComposedChart> for the hooks to
 * resolve against its context.
 */
function CandleLayer({ points }: { points: ChartPoint[] }) {
  const xScale = useXAxisScale(0)
  const yScale = useYAxisScale('price')
  if (!xScale || !yScale) return null

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
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
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
      {p.volume > 0 && (
        <div style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>
          Vol {formatCompact(p.volume)}
        </div>
      )}
    </div>
  )
}

const BUY_COLOR = 'var(--chart-1)'
const SL_COLOR = 'var(--loss)'
const TP_COLOR = 'var(--gain)'

type LegendSwatch = { label: string; color: string }

function ChartLegend({ items }: { items: LegendSwatch[] }) {
  if (items.length === 0) return null
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ backgroundColor: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

export type ScannerSignalChartProps = {
  signalId: string
  symbol: string
  buy: number | null
  sl: number | null
  tp1: number | null
  tp2: number | null
  entryDate: string | null
  entryPrice: number | null
  exitDate: string | null
  exitPrice: number | null
}

export function ScannerSignalChart({
  signalId,
  symbol,
  buy,
  sl,
  tp1,
  tp2,
  entryDate,
  entryPrice,
  exitDate,
  exitPrice,
}: ScannerSignalChartProps) {
  // EOD scanner data — no need to poll. Fetch once and cache generously.
  const candlesQuery = useQuery({
    queryKey: ['scanner-signal-candles', signalId],
    queryFn: () => fetchCandles(signalId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  })

  const points: ChartPoint[] = useMemo(() => {
    const rows = candlesQuery.data ?? []
    return rows.map((c) => ({
      // Daily candles are stamped at IST midnight but serialized as UTC, so format
      // the label in IST (a raw slice would read one calendar day early).
      label: formatInTimeZone(new Date(c.timestamp), 'Asia/Kolkata', 'yyyy-MM-dd'),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }))
  }, [candlesQuery.data])

  const labels = useMemo(() => points.map((p) => p.label), [points])
  const entryLabel = useMemo(() => snapLabel(entryDate, labels), [entryDate, labels])
  const exitLabel = useMemo(() => snapLabel(exitDate, labels), [exitDate, labels])

  // Fold the buy/sl/tp levels and entry/exit prices into the price domain so the
  // reference lines and dots never clip outside the plotted candle range.
  const priceDomain = useMemo<[number, number] | ['auto', 'auto']>(() => {
    if (points.length === 0) return ['auto', 'auto']
    let min = Infinity
    let max = -Infinity
    for (const p of points) {
      if (p.low < min) min = p.low
      if (p.high > max) max = p.high
    }
    for (const lv of [buy, sl, tp1, tp2, entryPrice, exitPrice]) {
      if (typeof lv === 'number' && Number.isFinite(lv)) {
        if (lv < min) min = lv
        if (lv > max) max = lv
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return ['auto', 'auto']
    const pad = (max - min) * 0.05 || max * 0.05 || 1
    return [min - pad, max + pad]
  }, [points, buy, sl, tp1, tp2, entryPrice, exitPrice])

  const maxVolume = points.reduce((m, p) => Math.max(m, p.volume), 0)
  const hasVolume = maxVolume > 0

  const legendItems: LegendSwatch[] = []
  if (typeof buy === 'number') legendItems.push({ label: 'Buy', color: BUY_COLOR })
  if (typeof sl === 'number') legendItems.push({ label: 'Stop', color: SL_COLOR })
  if (typeof tp1 === 'number' || typeof tp2 === 'number') {
    legendItems.push({ label: 'Target', color: TP_COLOR })
  }

  if (candlesQuery.isLoading) {
    return <Skeleton className="h-[360px] w-full" />
  }
  if (candlesQuery.isError) {
    return (
      <ErrorState
        className="h-[360px]"
        message={`Unable to load price history for ${symbol}.`}
      />
    )
  }
  if (points.length === 0) {
    return (
      <EmptyState
        className="h-[360px] min-h-0"
        description="No price data available for this signal's window."
      />
    )
  }

  const exitUp =
    typeof exitPrice === 'number' && typeof entryPrice === 'number'
      ? exitPrice >= entryPrice
      : true
  const exitColor = exitUp ? TP_COLOR : SL_COLOR

  return (
    <div className="space-y-3">
      <ChartLegend items={legendItems} />
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} minTickGap={40} />
          <YAxis
            yAxisId="price"
            {...axisProps}
            domain={priceDomain}
            tickFormatter={formatAxisInr}
            width={52}
          />
          <YAxis yAxisId="volume" hide domain={[0, hasVolume ? maxVolume * 4 : 1]} />
          <Tooltip content={<ChartTooltip />} />
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
          {/* Transparent series powers tooltip hit-testing; candles are the overlay. */}
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
          {typeof buy === 'number' && (
            <ReferenceLine
              yAxisId="price"
              y={buy}
              stroke={BUY_COLOR}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: 'Buy',
                position: 'insideTopLeft',
                fill: BUY_COLOR,
                fontSize: 10,
                fontWeight: 500,
              }}
            />
          )}
          {typeof sl === 'number' && (
            <ReferenceLine
              yAxisId="price"
              y={sl}
              stroke={SL_COLOR}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: 'SL',
                position: 'insideBottomLeft',
                fill: SL_COLOR,
                fontSize: 10,
                fontWeight: 500,
              }}
            />
          )}
          {typeof tp1 === 'number' && (
            <ReferenceLine
              yAxisId="price"
              y={tp1}
              stroke={TP_COLOR}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: 'TP1',
                position: 'insideTopLeft',
                fill: TP_COLOR,
                fontSize: 10,
                fontWeight: 500,
              }}
            />
          )}
          {typeof tp2 === 'number' && (
            <ReferenceLine
              yAxisId="price"
              y={tp2}
              stroke={TP_COLOR}
              strokeDasharray="2 4"
              ifOverflow="extendDomain"
              label={{
                value: 'TP2',
                position: 'insideTopLeft',
                fill: TP_COLOR,
                fontSize: 10,
                fontWeight: 500,
              }}
            />
          )}
          {entryLabel && typeof entryPrice === 'number' && (
            <ReferenceDot
              yAxisId="price"
              x={entryLabel}
              y={entryPrice}
              r={5}
              fill={BUY_COLOR}
              stroke="var(--background)"
              strokeWidth={2}
              ifOverflow="extendDomain"
              label={{
                value: 'Entry',
                position: 'top',
                fill: BUY_COLOR,
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          )}
          {exitLabel && typeof exitPrice === 'number' && (
            <ReferenceDot
              yAxisId="price"
              x={exitLabel}
              y={exitPrice}
              r={5}
              fill={exitColor}
              stroke="var(--background)"
              strokeWidth={2}
              ifOverflow="extendDomain"
              label={{
                value: 'Exit',
                position: 'top',
                fill: exitColor,
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
