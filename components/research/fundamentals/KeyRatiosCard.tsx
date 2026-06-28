'use client'

import { useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { fmtCrore, fmtNum, fmtPct, fmtPrice, fmtRatio } from './format'
import type { Fundamentals } from './types'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  )
}

export function KeyRatiosCard({ data }: { data: Fundamentals }) {
  const [showAll, setShowAll] = useState(false)
  const s = data.summary

  const headline: Array<{ label: string; value: string }> = [
    { label: 'Market cap', value: fmtCrore(s.marketCap) },
    { label: 'P/E (TTM)', value: fmtRatio(s.peTTM) },
    { label: 'Sector P/E', value: fmtRatio(s.sectorPe) },
    { label: 'P/B', value: fmtRatio(s.pbv) },
    { label: 'EPS (TTM)', value: fmtPrice(s.epsTTM) },
    { label: 'Book value / sh', value: fmtPrice(s.bookValuePerShare) },
    { label: 'Dividend yield', value: fmtPct(s.dividendYield) },
    { label: 'ROE (TTM)', value: fmtPct(s.roeTTM) },
    { label: 'Debt / equity', value: fmtRatio(s.debtToEquity) },
    { label: 'Beta', value: fmtRatio(s.beta) },
    { label: 'Net income', value: fmtCrore(s.netIncome) },
    { label: '52-wk range', value: `${fmtPrice(data.yearLow)} – ${fmtPrice(data.yearHigh)}` },
  ]

  const totalRatios = data.ratioGroups.reduce((n, g) => n + g.items.length, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Valuation &amp; key ratios</CardTitle>
        <CardDescription>Fundamentals via indianapi.in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="ring-foreground/10 grid grid-cols-2 overflow-hidden rounded-lg ring-1 sm:grid-cols-3 lg:grid-cols-4 [&>div]:border-b [&>div]:border-r">
          {headline.map((h) => (
            <Stat key={h.label} label={h.label} value={h.value} />
          ))}
          {/* Pad to a multiple of 12 (LCM of 2/3/4 columns) so no cell shows a
              dangling border on the last row. */}
          {Array.from({ length: (12 - (headline.length % 12)) % 12 }).map((_, i) => (
            <div key={`filler-${i}`} aria-hidden="true" />
          ))}
        </dl>

        {totalRatios > 0 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-muted-foreground hover:text-foreground text-xs font-medium underline-offset-4 hover:underline"
            >
              {showAll ? 'Hide detailed ratios' : `Show all ${totalRatios} ratios`}
            </button>

            {showAll && (
              <div className="space-y-5">
                {data.ratioGroups.map((group) => (
                  <section key={group.title} className="space-y-2">
                    <h3 className="text-muted-foreground text-xs font-medium">{group.title}</h3>
                    <dl className="ring-foreground/10 grid grid-cols-1 overflow-hidden rounded-lg ring-1 sm:grid-cols-2 lg:grid-cols-3 [&>div]:border-b [&>div]:border-r">
                      {group.items.map((m, i) => (
                        <div key={`${m.label}-${i}`} className="flex items-baseline justify-between gap-3 px-3 py-2">
                          <span className="text-muted-foreground text-xs">{m.label}</span>
                          <span className="shrink-0 text-sm font-medium tabular-nums">
                            {m.value === null ? (m.raw ?? '—') : fmtNum(m.value)}
                          </span>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
