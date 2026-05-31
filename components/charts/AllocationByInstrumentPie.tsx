'use client'

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'

export type AllocationByInstrumentDatum = {
  instrumentToken: string
  instrumentSymbol: string
  currentValue: number
}

export type AllocationByInstrumentPieProps = {
  data: AllocationByInstrumentDatum[]
  height?: number
}

const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export function AllocationByInstrumentPie({
  data,
  height = 320,
}: AllocationByInstrumentPieProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="currentValue"
          nameKey="instrumentSymbol"
          outerRadius="70%"
          label
        >
          {data.map((entry, idx) => (
            <Cell
              key={entry.instrumentToken}
              fill={PALETTE[idx % PALETTE.length]}
            />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
