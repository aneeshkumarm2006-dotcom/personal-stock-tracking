'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatCurrency } from '@/lib/format'
import {
  axisProps,
  formatAxisInr,
  gridProps,
  legendStyle,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from './chartTheme'

export type WealthHistoryDatum = {
  date: string
  cash: number
  investmentValue: number
  niftyValue: number
  fdValue: number
}

export type WealthHistoryChartProps = {
  data: WealthHistoryDatum[]
  height?: number
}

const LINES = [
  { key: 'investmentValue', name: 'My investments', color: 'var(--chart-1)' },
  { key: 'niftyValue', name: 'Nifty 50', color: 'var(--chart-2)' },
  { key: 'fdValue', name: 'FD @ 7.5%', color: 'var(--chart-3)' },
  { key: 'cash', name: 'Cash', color: 'var(--chart-4)' },
] as const

export function WealthHistoryChart({ data, height = 280 }: WealthHistoryChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} minTickGap={32} />
        <YAxis {...axisProps} tickFormatter={formatAxisInr} width={52} />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          formatter={(value) => formatCurrency(Number(value))}
        />
        <Legend wrapperStyle={legendStyle} />
        {LINES.map((line) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
