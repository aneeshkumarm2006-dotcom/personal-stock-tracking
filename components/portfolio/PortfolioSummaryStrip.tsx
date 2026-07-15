'use client'

import { useQuery } from '@tanstack/react-query'

import type { PortfolioSummary } from '@/lib/portfolio/summary'
import type { CashSummary } from '@/lib/portfolio/cash'
import { PortfolioSummaryCards } from './PortfolioSummaryCards'
import { CashCard } from './CashCard'

export type PortfolioSummaryResponse = PortfolioSummary & { cash: CashSummary }

async function fetchSummary(): Promise<PortfolioSummaryResponse> {
  const res = await fetch('/api/portfolio/summary', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to load summary (${res.status})`)
  return (await res.json()) as PortfolioSummaryResponse
}

// Client-driven summary + cash strip. Seeded with server-computed `initialData`
// so it renders instantly on first paint, then stays live purely through query
// invalidation: the PortfolioLivePrices poller (and the transaction/cash
// mutations) invalidate ['portfolioSummary'] whenever prices or funds change.
// This is what lets the portfolio page drop the 15s router.refresh() that used
// to re-run the whole server component (a second full holdings recompute) on
// every live tick.
export function PortfolioSummaryStrip({
  initialData,
}: {
  initialData: PortfolioSummaryResponse
}) {
  const { data } = useQuery({
    queryKey: ['portfolioSummary'],
    queryFn: fetchSummary,
    initialData,
  })
  const summary = data ?? initialData

  return (
    <div className="space-y-6">
      <PortfolioSummaryCards summary={summary} />
      <CashCard cash={summary.cash} />
    </div>
  )
}
