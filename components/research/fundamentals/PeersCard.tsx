'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { fmtCrore, fmtNum, fmtPct, fmtPrice, fmtRatio } from './format'
import { pnlColorClass } from '@/lib/format'
import type { Fundamentals } from './types'

export function PeersCard({ data }: { data: Fundamentals }) {
  const peers = data.peers

  return (
    <Card>
      <CardHeader>
        <CardTitle>Peer comparison</CardTitle>
      </CardHeader>
      <CardContent>
        {peers.length === 0 ? (
          <EmptyState description="No peer data available." className="min-h-20 py-6" />
        ) : (
          <div className="ring-foreground/10 overflow-x-auto rounded-lg ring-1">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-foreground/10 text-muted-foreground border-b text-xs font-medium">
                  <th className="px-3 py-2 text-left">Company</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Chg %</th>
                  <th className="px-3 py-2 text-right">P/E</th>
                  <th className="px-3 py-2 text-right">P/B</th>
                  <th className="px-3 py-2 text-right">Mkt cap</th>
                  <th className="px-3 py-2 text-right">ROE %</th>
                  <th className="px-3 py-2 text-right">NPM %</th>
                  <th className="px-3 py-2 text-right">D/E</th>
                  <th className="px-3 py-2 text-right">Div %</th>
                  <th className="px-3 py-2 text-left">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-foreground/10 divide-y tabular-nums">
                {peers.map((p, i) => (
                  <tr key={`${p.name}-${i}`}>
                    <td className="px-3 py-2 text-left font-medium whitespace-normal">{p.name}</td>
                    <td className="px-3 py-2 text-right">{fmtPrice(p.price)}</td>
                    <td className={cn('px-3 py-2 text-right', pnlColorClass(p.percentChange))}>
                      {fmtPct(p.percentChange, true)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtRatio(p.pe)}</td>
                    <td className="px-3 py-2 text-right">{fmtRatio(p.pb)}</td>
                    <td className="px-3 py-2 text-right">{fmtCrore(p.marketCap)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(p.roe)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(p.netProfitMargin)}</td>
                    <td className="px-3 py-2 text-right">{fmtRatio(p.debtToEquity)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(p.dividendYield)}</td>
                    <td className="text-muted-foreground px-3 py-2 text-left whitespace-normal">
                      {p.rating ?? '—'}
                    </td>
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
