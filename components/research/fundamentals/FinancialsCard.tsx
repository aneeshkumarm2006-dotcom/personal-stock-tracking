'use client'

import { useMemo, useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { fmtMonthYear, fmtNum } from './format'
import type { FinancialPeriod, Fundamentals } from './types'

type StatementKey = 'income' | 'balance' | 'cashflow'
type PeriodKey = 'annual' | 'quarterly'

const STATEMENTS: Array<{ key: StatementKey; label: string }> = [
  { key: 'income', label: 'Income' },
  { key: 'balance', label: 'Balance sheet' },
  { key: 'cashflow', label: 'Cash flow' },
]

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: Array<{ key: T; label: string }>
  onChange: (key: T) => void
  ariaLabel: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="bg-muted inline-flex rounded-lg p-[3px]">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function periodLabel(p: FinancialPeriod, type: PeriodKey): string {
  if (type === 'annual') return p.fiscalYear ? `FY${p.fiscalYear}` : fmtMonthYear(p.endDate)
  return fmtMonthYear(p.endDate)
}

export function FinancialsCard({ data }: { data: Fundamentals }) {
  const [statement, setStatement] = useState<StatementKey>('income')
  const [periodType, setPeriodType] = useState<PeriodKey>('annual')

  const periods = periodType === 'annual' ? data.financials.annual : data.financials.quarterly

  // Build the row set as the ordered union of line-item labels across periods
  // (period coverage can vary slightly), plus a per-period value lookup.
  const { rows, lookups } = useMemo(() => {
    const labels: string[] = []
    const seen = new Set<string>()
    const maps = periods.map((p) => {
      const m = new Map<string, number | null>()
      for (const item of p[statement]) {
        m.set(item.label, item.value)
        if (!seen.has(item.label)) {
          seen.add(item.label)
          labels.push(item.label)
        }
      }
      return m
    })
    return { rows: labels, lookups: maps }
  }, [periods, statement])

  const hasData = periods.length > 0 && rows.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financials</CardTitle>
        <CardDescription>Figures in ₹ Crore, as reported by the provider.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            value={statement}
            options={STATEMENTS}
            onChange={setStatement}
            ariaLabel="Statement"
          />
          <Segmented
            value={periodType}
            options={[
              { key: 'annual' as PeriodKey, label: 'Annual' },
              { key: 'quarterly' as PeriodKey, label: 'Quarterly' },
            ]}
            onChange={setPeriodType}
            ariaLabel="Period"
          />
        </div>

        {!hasData ? (
          <EmptyState description="No data for this statement." className="min-h-20 py-6" />
        ) : (
          <div className="ring-foreground/10 overflow-x-auto rounded-lg ring-1">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-foreground/10 border-b">
                  <th className="bg-card text-muted-foreground sticky left-0 z-10 px-3 py-2 text-left text-xs font-medium">
                    Line item
                  </th>
                  {periods.map((p, i) => (
                    <th
                      key={i}
                      className="text-muted-foreground px-3 py-2 text-right text-xs font-medium tabular-nums"
                    >
                      {periodLabel(p, periodType)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-foreground/10 divide-y tabular-nums">
                {rows.map((label) => (
                  <tr key={label}>
                    <td className="bg-card text-muted-foreground sticky left-0 z-10 px-3 py-2 text-left whitespace-normal">
                      {label}
                    </td>
                    {lookups.map((m, i) => (
                      <td key={i} className="px-3 py-2 text-right font-medium">
                        {fmtNum(m.get(label) ?? null, 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
