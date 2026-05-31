'use client'

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'

export type AllocationBySectorDatum = {
  sector: string
  currentValue: number
}

export type AllocationBySectorPieProps = {
  data: AllocationBySectorDatum[]
  height?: number
}

const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export function AllocationBySectorPie({
  data,
  height = 320,
}: AllocationBySectorPieProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="currentValue"
          nameKey="sector"
          outerRadius="70%"
          label
        >
          {data.map((entry, idx) => (
            <Cell key={entry.sector} fill={PALETTE[idx % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
