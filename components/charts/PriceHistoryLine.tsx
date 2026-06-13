'use client'

import {
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  Line,
  Scatter,
  ComposedChart,
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

export type PriceHistoryCandle = {
  date: string
  close: number
}

export type PriceHistoryMarker = {
  date: string
  price: number
}

export type PriceHistoryLineProps = {
  data: PriceHistoryCandle[]
  buyMarkers?: PriceHistoryMarker[]
  height?: number
}

export function PriceHistoryLine({
  data,
  buyMarkers = [],
  height = 340,
}: PriceHistoryLineProps) {
  const merged = data.map((candle) => {
    const buy = buyMarkers.find((m) => m.date === candle.date)
    return { ...candle, buyPrice: buy?.price }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={merged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" {...axisProps} minTickGap={32} />
        <YAxis
          {...axisProps}
          domain={['auto', 'auto']}
          tickFormatter={formatAxisInr}
          width={52}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          formatter={(value) => formatCurrency(Number(value))}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={legendStyle} />
        <Line
          type="monotone"
          dataKey="close"
          stroke="var(--chart-1)"
          dot={false}
          strokeWidth={1.5}
          name="Close price"
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
        <Scatter dataKey="buyPrice" fill="var(--gain)" name="Buy" shape="circle" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
