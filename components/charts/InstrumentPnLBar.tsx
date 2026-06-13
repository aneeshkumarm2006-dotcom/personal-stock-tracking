'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts'

import { formatCurrency } from '@/lib/format'
import {
  axisProps,
  formatAxisInr,
  gridProps,
  tooltipContentStyle,
  tooltipCursor,
  tooltipItemStyle,
  tooltipLabelStyle,
} from './chartTheme'

export type InstrumentPnLDatum = {
  instrumentSymbol: string
  pnl: number
}

export type InstrumentPnLBarProps = {
  data: InstrumentPnLDatum[]
  height?: number
}

export function InstrumentPnLBar({ data, height = 280 }: InstrumentPnLBarProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="instrumentSymbol" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={formatAxisInr} width={52} />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          cursor={tooltipCursor}
          formatter={(value) => [formatCurrency(Number(value)), 'P&L']}
        />
        <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((entry) => (
            <Cell
              key={entry.instrumentSymbol}
              fill={entry.pnl >= 0 ? 'var(--gain)' : 'var(--loss)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
