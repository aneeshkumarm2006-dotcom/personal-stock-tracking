'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'

export type PortfolioValueDatum = {
  date: string
  totalValue: number
  totalInvested: number
}

export type PortfolioValueAreaProps = {
  data: PortfolioValueDatum[]
  height?: number
}

export function PortfolioValueArea({
  data,
  height = 320,
}: PortfolioValueAreaProps) {
  const latestInvested = data.at(-1)?.totalInvested

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {typeof latestInvested === 'number' && (
          <ReferenceLine
            y={latestInvested}
            strokeDasharray="4 4"
            stroke="var(--muted-foreground)"
            label={{ value: 'Invested', position: 'right', fontSize: 11 }}
          />
        )}
        <Area
          type="monotone"
          dataKey="totalValue"
          stroke="var(--chart-1)"
          fill="var(--chart-1)"
          fillOpacity={0.25}
          name="Portfolio value"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
