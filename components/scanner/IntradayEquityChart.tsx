'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatCurrency } from '@/lib/format'
import type { IntradayDailyPoint } from '@/lib/scanner/types'
import {
  axisProps,
  gridProps,
  legendStyle,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from '@/components/charts/chartTheme'

export type IntradayEquityChartProps = {
  daily: IntradayDailyPoint[]
  height?: number
}

// A young test moves a few thousand rupees on lakhs of capital, so the shared
// 1-decimal axis formatter would print every tick as the same "₹5.1L".
const inrAxisFormatter = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

function formatAxisInr(value: number): string {
  if (!Number.isFinite(value)) return ''
  const sign = value < 0 ? '-' : ''
  return `${sign}₹${inrAxisFormatter.format(Math.abs(value))}`
}

// The swing equity chart's twin for the A/B experiment: both exits' equity on
// one axis, session by session, so the gap between the two lines IS the verdict.
export function IntradayEquityChart({
  daily,
  height = 280,
}: IntradayEquityChartProps) {
  // Pad the Y domain — with the default ['dataMin','dataMax'] the two near-flat
  // lines sit exactly on the chart's top and bottom borders and disappear.
  const values = daily.flatMap((d) => [d.equityA, d.equityB])
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const span = Math.max(max - min, Math.abs(max) * 0.004, 1)
  const domain: [number, number] = [min - span * 0.2, max + span * 0.2]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="intradayEquityFillA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="intradayEquityFillB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} minTickGap={32} />
        <YAxis
          {...axisProps}
          tickFormatter={formatAxisInr}
          width={56}
          domain={domain}
          tickCount={4}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          formatter={(value) => formatCurrency(Number(value))}
        />
        <Legend wrapperStyle={legendStyle} />
        <Area
          type="monotone"
          dataKey="equityA"
          name="Exit A (books 1.5×)"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#intradayEquityFillA)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          connectNulls
        />
        <Area
          type="monotone"
          dataKey="equityB"
          name="Exit B (holds 2×)"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#intradayEquityFillB)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
