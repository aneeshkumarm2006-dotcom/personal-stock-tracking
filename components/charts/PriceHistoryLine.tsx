'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  Scatter,
  ComposedChart,
} from 'recharts'

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
  height = 360,
}: PriceHistoryLineProps) {
  const merged = data.map((candle) => {
    const buy = buyMarkers.find((m) => m.date === candle.date)
    return { ...candle, buyPrice: buy?.price }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="close"
          stroke="var(--chart-1)"
          dot={false}
          strokeWidth={2}
          name="Close price"
        />
        <Scatter
          dataKey="buyPrice"
          fill="var(--chart-2)"
          name="Buy"
          shape="circle"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export { LineChart }
