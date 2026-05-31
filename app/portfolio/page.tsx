import { connectDB } from '@/lib/db/connect'
import { Transaction } from '@/lib/db/models/Transaction'
import {
  computeHoldings,
  type TransactionForHoldings,
} from '@/lib/portfolio/holdings'
import { computeSummary } from '@/lib/portfolio/summary'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'

import { PortfolioSummaryCards } from '@/components/portfolio/PortfolioSummaryCards'
import { HoldingsTable } from '@/components/portfolio/HoldingsTable'
import { AddTransactionDialog } from '@/components/portfolio/AddTransactionDialog'
import { TransactionHistoryTable } from '@/components/portfolio/TransactionHistoryTable'
import { RealizedPnLTable } from '@/components/portfolio/RealizedPnLTable'
import { PortfolioCharts } from '@/components/portfolio/PortfolioCharts'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage() {
  await connectDB()

  const transactions = (await Transaction.find({})
    .sort({ date: 1 })
    .lean()) as unknown as TransactionForHoldings[]

  const holdings = computeHoldings(transactions)
  const tokens = holdings.map((h) => h.instrumentToken)
  const snapshots = await loadSnapshotsForTokens(tokens)
  const summary = computeSummary(holdings, snapshots)

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Portfolio
          </h1>
          <p className="text-muted-foreground text-sm">
            Live holdings, P&L and history powered by Angel One.
          </p>
        </div>
        <AddTransactionDialog />
      </header>

      <PortfolioSummaryCards summary={summary} />

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Holdings</h2>
        <HoldingsTable />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Charts</h2>
        <PortfolioCharts />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Realized P&L</h2>
        <RealizedPnLTable />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Transaction history</h2>
        <TransactionHistoryTable />
      </section>
    </div>
  )
}
