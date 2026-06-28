'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { fmtDate } from './format'
import type { CorporateAction, Fundamentals } from './types'

function ActionList({ title, items }: { title: string; items: CorporateAction[] }) {
  if (items.length === 0) return null
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      <ul className="ring-foreground/10 divide-foreground/10 divide-y overflow-hidden rounded-lg ring-1">
        {items.slice(0, 6).map((a, i) => (
          <li key={`${a.remarks}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2">
            <span className="text-sm">{a.remarks}</span>
            <span className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
              {fmtDate(a.date)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function CorporateActionsCard({ data }: { data: Fundamentals }) {
  const { dividends, bonuses, splits } = data.corporateActions
  if (dividends.length === 0 && bonuses.length === 0 && splits.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Corporate actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <ActionList title="Dividends" items={dividends} />
        <ActionList title="Bonus issues" items={bonuses} />
        <ActionList title="Stock splits" items={splits} />
      </CardContent>
    </Card>
  )
}
