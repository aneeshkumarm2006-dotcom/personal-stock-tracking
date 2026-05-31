'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'

export type InstrumentPnLDatum = {
  instrumentSymbol: string
  pnl: number
}

export type InstrumentPnLBarProps = {
  data: InstrumentPnLDatum[]
  height?: number
}

export function InstrumentPnLBar({ data, height = 320 }: InstrumentPnLBarProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="instrumentSymbol" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="pnl" name="P&L">
          {data.map((entry) => (
            <Cell
              key={entry.instrumentSymbol}
              fill={entry.pnl >= 0 ? 'var(--chart-2)' : 'var(--destructive)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
