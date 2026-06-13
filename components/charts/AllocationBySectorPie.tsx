'use client'

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'

import { formatCurrency } from '@/lib/format'
import {
  CHART_PALETTE,
  legendStyle,
  tooltipContentStyle,
  tooltipItemStyle,
} from './chartTheme'

export type AllocationBySectorDatum = {
  sector: string
  currentValue: number
}

export type AllocationBySectorPieProps = {
  data: AllocationBySectorDatum[]
  height?: number
}

export function AllocationBySectorPie({
  data,
  height = 280,
}: AllocationBySectorPieProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="currentValue"
          nameKey="sector"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke="var(--card)"
          strokeWidth={2}
        >
          {data.map((entry, idx) => (
            <Cell key={entry.sector} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipContentStyle}
          itemStyle={tooltipItemStyle}
          formatter={(value) => formatCurrency(Number(value))}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={legendStyle} />
      </PieChart>
    </ResponsiveContainer>
  )
}
