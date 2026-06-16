'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from 'recharts'

import { formatCurrency } from '@/lib/format'
import {
  axisProps,
  formatAxisInr,
  gridProps,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from './chartTheme'

export type PortfolioValueDatum = {
  date: string
  totalWealth: number
  fundsAdded: number
}

export type PortfolioValueAreaProps = {
  data: PortfolioValueDatum[]
  height?: number
}

export function PortfolioValueArea({
  data,
  height = 280,
}: PortfolioValueAreaProps) {
  const latestFundsAdded = data.at(-1)?.fundsAdded

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="portfolioValueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} minTickGap={32} />
        <YAxis {...axisProps} tickFormatter={formatAxisInr} width={52} />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          formatter={(value) => formatCurrency(Number(value))}
        />
        {typeof latestFundsAdded === 'number' && (
          <ReferenceLine
            y={latestFundsAdded}
            strokeDasharray="4 4"
            stroke="var(--muted-foreground)"
            strokeOpacity={0.6}
            label={{
              value: 'Funds added',
              position: 'insideTopRight',
              fontSize: 11,
              fill: 'var(--muted-foreground)',
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="totalWealth"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#portfolioValueFill)"
          name="Total wealth"
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
