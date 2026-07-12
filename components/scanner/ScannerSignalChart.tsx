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

// ── Pattern geometry overlay ────────────────────────────────────────────────
// Draws the stored detection geometry (necklines, rims, trendlines, pivots, poles)
// over the candles. All positions in `geometry` are BAR INDICES into the detection
// frame (not dates); they map to the chart's date labels via the confirm anchor —
// pattern_span[1] is the confirm bar (== confirmDate), so bar `pos` lands on
// labels[confirmIdx - (jPos - pos)]. Out-of-window positions (a window too short
// for a long base) are simply skipped, so the level lines always render even when
// the pivots/trendlines don't.

const GEO_COLOR = '#8b5cf6' // violet — distinct from Buy/SL/TP, readable in both themes

// Whitelisted single-price levels → label (a horizontal line across the pattern).
const GEO_SCALAR_LEVELS: Record<string, string> = {
  neckline: 'Neckline',
  head: 'Head',
  resistance: 'Resistance',
  support: 'Support',
  valley: 'Valley',
  peak: 'Peak',
  cup_low: 'Cup low',
  handle_low: 'Handle',
  range_hi: 'Range hi',
  range_lo: 'Range lo',
  flag_low: 'Flag low',
  flag_high: 'Flag high',
  reclaim_level: 'Reclaim',
}
// Price PAIRS → two horizontal lines (rim/bottoms/shoulders).
const GEO_PAIR_LEVELS: Record<string, [string, string]> = {
  cup_rim: ['Left rim', 'Right rim'],
  bottoms: ['Bottom 1', 'Bottom 2'],
  shoulders: ['L shoulder', 'R shoulder'],
}
// [slope, intercept] in position space (price = slope*pos + intercept).
const GEO_TRENDLINES = new Set(['support_line', 'resistance_line', 'upper_line'])

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
function numPair(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1])
    ? [v[0], v[1]]
    : null
}

// Every price-like value in the geometry, so the y-domain can fold them in and
// nothing clips outside the plotted candle range.
function geometryPrices(geometry: Record<string, unknown>): number[] {
  const out: number[] = []
  const span = numPair(geometry.pattern_span)
  for (const [key, value] of Object.entries(geometry)) {
    if (key in GEO_SCALAR_LEVELS && isNum(value)) out.push(value)
    else if (key in GEO_PAIR_LEVELS) {
      const p = numPair(value)
      if (p) out.push(p[0], p[1])
    } else if (GEO_TRENDLINES.has(key)) {
      const line = numPair(value)
      if (line && span) out.push(line[0] * span[0] + line[1], line[0] * span[1] + line[1])
    } else if (key === 'pole' && Array.isArray(value) && value.length === 4) {
      if (isNum(value[1])) out.push(value[1])
      if (isNum(value[3])) out.push(value[3])
    } else if (key === 'pivots' && Array.isArray(value)) {
      for (const piv of value) if (Array.isArray(piv) && isNum(piv[1])) out.push(piv[1])
    }
  }
  return out.filter(Number.isFinite)
}

function PatternOverlayLayer({
  geometry,
  labels,
  confirmLabel,
}: {
  geometry: Record<string, unknown>
  labels: string[]
  confirmLabel: string | null
}) {
  const xScale = useXAxisScale(0)
  const yScale = useYAxisScale('price')
  if (!xScale || !yScale || !confirmLabel) return null
  const confirmIdx = labels.indexOf(confirmLabel)
  if (confirmIdx < 0) return null

  const span = numPair(geometry.pattern_span)
  const jPos = span ? span[1] : null

  const labelOf = (pos: number): string | null => {
    if (jPos == null) return null
    const idx = confirmIdx - (jPos - pos)
    return idx >= 0 && idx < labels.length ? labels[idx]! : null
  }
  const xOf = (pos: number): number | null => {
    const l = labelOf(pos)
    if (l == null) return null
    const x = xScale(l, { position: 'middle' })
    return x == null ? null : x
  }
  const firstLabel = labels[0]
  const lastLabel = labels[labels.length - 1]
  const leftEdge = firstLabel ? (xScale(firstLabel, { position: 'start' }) ?? null) : null
  const rightEdge = lastLabel ? (xScale(lastLabel, { position: 'end' }) ?? null) : null
  const confirmX = xScale(confirmLabel, { position: 'middle' }) ?? rightEdge
  const spanStartX = span ? (xOf(span[0]) ?? leftEdge) : leftEdge
  const spanEndX = confirmX ?? rightEdge

  const elems: React.ReactNode[] = []

  const drawLevel = (price: number, text: string, key: string) => {
    const yy = yScale(price)
    if (yy == null || spanStartX == null || spanEndX == null) return
    elems.push(
      <g key={key}>
        <line
          x1={spanStartX}
          y1={yy}
          x2={spanEndX}
          y2={yy}
          stroke={GEO_COLOR}
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.9}
        />
        <text x={spanStartX + 2} y={yy - 2} fill={GEO_COLOR} fontSize={9}>
          {text}
        </text>
      </g>,
    )
  }

  for (const [key, value] of Object.entries(geometry)) {
    if (key in GEO_SCALAR_LEVELS && isNum(value)) {
      drawLevel(value, GEO_SCALAR_LEVELS[key]!, `lvl-${key}`)
    } else if (key in GEO_PAIR_LEVELS) {
      const p = numPair(value)
      if (p) {
        drawLevel(p[0], GEO_PAIR_LEVELS[key]![0], `lvl-${key}-0`)
        drawLevel(p[1], GEO_PAIR_LEVELS[key]![1], `lvl-${key}-1`)
      }
    } else if (GEO_TRENDLINES.has(key)) {
      const line = numPair(value)
      if (line && span) {
        let a: number | null = null
        let b: number | null = null
        for (let p = span[0]; p <= span[1]; p++) {
          if (labelOf(p) != null) {
            if (a == null) a = p
            b = p
          }
        }
        if (a != null && b != null) {
          const xa = xOf(a)
          const xb = xOf(b)
          const ya = yScale(line[0] * a + line[1])
          const yb = yScale(line[0] * b + line[1])
          if (xa != null && xb != null && ya != null && yb != null) {
            elems.push(
              <line
                key={`tl-${key}`}
                x1={xa}
                y1={ya}
                x2={xb}
                y2={yb}
                stroke={GEO_COLOR}
                strokeWidth={1.5}
                opacity={0.9}
              />,
            )
          }
        }
      }
    } else if (
      key === 'pole' &&
      Array.isArray(value) &&
      value.length === 4 &&
      isNum(value[0]) &&
      isNum(value[1]) &&
      isNum(value[2]) &&
      isNum(value[3])
    ) {
      const xa = xOf(value[0])
      const xb = xOf(value[2])
      const ya = yScale(value[1])
      const yb = yScale(value[3])
      if (xa != null && xb != null && ya != null && yb != null) {
        elems.push(
          <line
            key="pole"
            x1={xa}
            y1={ya}
            x2={xb}
            y2={yb}
            stroke={GEO_COLOR}
            strokeWidth={1.5}
            opacity={0.9}
          />,
        )
      }
    } else if (key === 'pivots' && Array.isArray(value)) {
      value.forEach((piv, i) => {
        if (!Array.isArray(piv) || !isNum(piv[0]) || !isNum(piv[1])) return
        const x = xOf(piv[0])
        const y = yScale(piv[1])
        if (x == null || y == null) return
        const kind = typeof piv[2] === 'string' ? piv[2] : ''
        elems.push(
          <g key={`piv-${i}`}>
            <circle
              cx={x}
              cy={y}
              r={3}
              fill={GEO_COLOR}
              stroke="var(--background)"
              strokeWidth={1}
            />
            {kind ? (
              <text
                x={x}
                y={kind === 'H' ? y - 5 : y + 11}
                fill={GEO_COLOR}
                fontSize={9}
                textAnchor="middle"
              >
                {kind}
              </text>
            ) : null}
          </g>,
        )
      })
    }
  }

  return <g>{elems}</g>
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
  // Optional chart-pattern overlay (pivots/trendlines/levels). `confirmDate` is
  // the breakout bar the geometry's bar-index positions anchor to.
  patternGeometry?: Record<string, unknown> | null
  confirmDate?: string | null
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
  patternGeometry = null,
  confirmDate = null,
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
  const confirmLabel = useMemo(
    () => snapLabel(confirmDate ?? null, labels),
    [confirmDate, labels],
  )
  const geoPrices = useMemo(
    () => (patternGeometry ? geometryPrices(patternGeometry) : []),
    [patternGeometry],
  )

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
    for (const lv of [buy, sl, tp1, tp2, entryPrice, exitPrice, ...geoPrices]) {
      if (typeof lv === 'number' && Number.isFinite(lv)) {
        if (lv < min) min = lv
        if (lv > max) max = lv
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return ['auto', 'auto']
    const pad = (max - min) * 0.05 || max * 0.05 || 1
    return [min - pad, max + pad]
  }, [points, buy, sl, tp1, tp2, entryPrice, exitPrice, geoPrices])

  const maxVolume = points.reduce((m, p) => Math.max(m, p.volume), 0)
  const hasVolume = maxVolume > 0

  const legendItems: LegendSwatch[] = []
  if (typeof buy === 'number') legendItems.push({ label: 'Buy', color: BUY_COLOR })
  if (typeof sl === 'number') legendItems.push({ label: 'Stop', color: SL_COLOR })
  if (typeof tp1 === 'number' || typeof tp2 === 'number') {
    legendItems.push({ label: 'Target', color: TP_COLOR })
  }
  if (patternGeometry && Object.keys(patternGeometry).length > 0) {
    legendItems.push({ label: 'Pattern geometry', color: GEO_COLOR })
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
          {patternGeometry && (
            <PatternOverlayLayer
              geometry={patternGeometry}
              labels={labels}
              confirmLabel={confirmLabel}
            />
          )}
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
