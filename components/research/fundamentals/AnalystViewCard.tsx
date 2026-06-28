'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { fmtNum } from './format'
import type { Fundamentals } from './types'

export function AnalystViewCard({ data }: { data: Fundamentals }) {
  const { recommendations, averageRating, totalAnalysts, meanValue, riskCategory, riskStdDev } =
    data.analyst
  const total = recommendations.reduce((n, r) => n + r.count, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analyst view</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {averageRating && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground text-xs">Consensus</span>
            <span className="text-base font-semibold">{averageRating}</span>
          </div>
        )}

        {total > 0 ? (
          <div className="space-y-3">
            {/* Distribution bar — each segment sized by analyst count. */}
            <div className="flex h-2.5 w-full overflow-hidden rounded-full">
              {recommendations.map((r) =>
                r.count > 0 ? (
                  <div
                    key={r.name}
                    style={{ width: `${(r.count / total) * 100}%`, backgroundColor: r.color }}
                    title={`${r.name}: ${r.count}`}
                  />
                ) : null,
              )}
            </div>
            <ul className="space-y-1.5">
              {recommendations.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: r.color }}
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">{r.name}</span>
                  </span>
                  <span className="font-medium tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState description="No analyst ratings available." className="min-h-20 py-6" />
        )}

        <dl className="ring-foreground/10 grid grid-cols-2 overflow-hidden rounded-lg ring-1 [&>div]:border-b [&>div]:border-r">
          <div className="px-3 py-2.5">
            <dt className="text-muted-foreground text-xs">Analysts covering</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">
              {totalAnalysts ?? total ?? '—'}
            </dd>
          </div>
          <div className="px-3 py-2.5">
            <dt className="text-muted-foreground text-xs">Mean rating (1–5)</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{fmtNum(meanValue)}</dd>
          </div>
          {riskCategory && (
            <div className="px-3 py-2.5">
              <dt className="text-muted-foreground text-xs">Risk</dt>
              <dd className="mt-0.5 text-sm font-semibold">{riskCategory}</dd>
            </div>
          )}
          {riskStdDev !== null && (
            <div className="px-3 py-2.5">
              <dt className="text-muted-foreground text-xs">Volatility (σ)</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">{fmtNum(riskStdDev)}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}
