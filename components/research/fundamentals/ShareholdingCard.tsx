'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { fmtMonthYear, fmtPct } from './format'
import type { Fundamentals } from './types'

export function ShareholdingCard({ data }: { data: Fundamentals }) {
  const groups = data.shareholding

  // Use the union of dates across groups as columns (most groups share the same
  // quarters), ordered chronologically and capped to the last four.
  const dateSet = new Set<string>()
  for (const g of groups) for (const p of g.series) if (p.date) dateSet.add(p.date)
  const dates = Array.from(dateSet).sort().slice(-4)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shareholding pattern</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 || dates.length === 0 ? (
          <EmptyState description="No shareholding data available." className="min-h-20 py-6" />
        ) : (
          <div className="ring-foreground/10 overflow-x-auto rounded-lg ring-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-foreground/10 border-b">
                  <th className="text-muted-foreground px-3 py-2 text-left text-xs font-medium">
                    Holder
                  </th>
                  {dates.map((d) => (
                    <th
                      key={d}
                      className="text-muted-foreground px-3 py-2 text-right text-xs font-medium tabular-nums"
                    >
                      {fmtMonthYear(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-foreground/10 divide-y">
                {groups.map((g) => {
                  const byDate = new Map(g.series.map((p) => [p.date, p.percentage]))
                  return (
                    <tr key={g.name}>
                      <td className="px-3 py-2 font-medium">{g.name}</td>
                      {dates.map((d) => (
                        <td key={d} className="px-3 py-2 text-right tabular-nums">
                          {fmtPct(byDate.get(d) ?? null)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
