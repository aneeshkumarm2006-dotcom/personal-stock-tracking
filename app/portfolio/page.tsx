import { connectDB } from '@/lib/db/connect'
import { loadHoldingsResponse } from '@/lib/portfolio/holdingsResponse'
import { loadPortfolioSummary } from '@/lib/portfolio/summaryResponse'

import { PageHeader, SectionHeader } from '@/components/PageHeader'
import { PortfolioLivePrices } from '@/components/portfolio/PortfolioLivePrices'
import { PortfolioSummaryStrip } from '@/components/portfolio/PortfolioSummaryStrip'
import { HoldingsTable } from '@/components/portfolio/HoldingsTable'
import { AddTransactionDialog } from '@/components/portfolio/AddTransactionDialog'
import { TransactionHistoryTable } from '@/components/portfolio/TransactionHistoryTable'
import { RealizedPnLTable } from '@/components/portfolio/RealizedPnLTable'
import { PortfolioCharts } from '@/components/portfolio/PortfolioCharts'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage() {
  await connectDB()

  // Compute the holdings and summary payloads once, server-side, and hand them
  // to the client components as `initialData`. That way the first paint uses
  // this render's data instead of firing an immediate refetch of the same work,
  // and the live poller keeps them current afterward via query invalidation —
  // no per-tick router.refresh() re-running the whole server component.
  const [holdingsData, summaryData] = await Promise.all([
    loadHoldingsResponse(),
    loadPortfolioSummary(),
  ])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Portfolio"
        description="Live holdings, P&L and history powered by Angel One."
        actions={<AddTransactionDialog />}
      />

      <PortfolioLivePrices />

      <PortfolioSummaryStrip initialData={summaryData} />

      <section className="space-y-3">
        <SectionHeader title="Holdings" />
        <HoldingsTable initialData={holdingsData} />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Analytics" />
        <PortfolioCharts initialHoldings={holdingsData} />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Realized P&L" />
        <RealizedPnLTable />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Transaction history" />
        <TransactionHistoryTable />
      </section>
    </div>
  )
}
