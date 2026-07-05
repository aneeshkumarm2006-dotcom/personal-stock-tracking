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
import type { ScannerDailyStat } from '@/lib/scanner/types'
import {
  axisProps,
  formatAxisInr,
  gridProps,
  legendStyle,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from '@/components/charts/chartTheme'

export type ScannerEquityChartProps = {
  daily: ScannerDailyStat[]
  height?: number
}

type Datum = {
  date: string
  equity: number | null
  drawdown: number | null
}

export function ScannerEquityChart({ daily, height = 280 }: ScannerEquityChartProps) {
  // Equity plots on its own (left) axis; max drawdown is drawn as a negative-going
  // area on a separate (right) axis so its small magnitude stays readable next to
  // the large equity values. We render drawdown as -|value| to normalise whichever
  // sign convention the pipeline stores.
  const data: Datum[] = daily.map((d) => ({
    date: d.date,
    equity: typeof d.equity === 'number' ? d.equity : null,
    drawdown:
      typeof d.maxDrawdownToDate === 'number' ? -Math.abs(d.maxDrawdownToDate) : null,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="scannerEquityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="scannerDrawdownFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--loss)" stopOpacity={0} />
            <stop offset="100%" stopColor="var(--loss)" stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} minTickGap={32} />
        <YAxis
          yAxisId="equity"
          {...axisProps}
          tickFormatter={formatAxisInr}
          width={52}
        />
        <YAxis
          yAxisId="drawdown"
          orientation="right"
          {...axisProps}
          tickFormatter={formatAxisInr}
          width={52}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          formatter={(value) => formatCurrency(Number(value))}
        />
        <Legend wrapperStyle={legendStyle} />
        <Area
          yAxisId="drawdown"
          type="monotone"
          dataKey="drawdown"
          name="Max drawdown"
          stroke="var(--loss)"
          strokeWidth={1.5}
          fill="url(#scannerDrawdownFill)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          connectNulls
        />
        <Area
          yAxisId="equity"
          type="monotone"
          dataKey="equity"
          name="Equity"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#scannerEquityFill)"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
