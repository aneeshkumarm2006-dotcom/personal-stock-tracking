import { connectDB } from '@/lib/db/connect'
import { CashAccount } from '@/lib/db/models/CashAccount'
import { Transaction } from '@/lib/db/models/Transaction'
import {
  computeHoldings,
  type TransactionForHoldings,
} from '@/lib/portfolio/holdings'
import { computeCash, computeNetInvested } from '@/lib/portfolio/cash'
import { computeSummary } from '@/lib/portfolio/summary'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'

import { PageHeader, SectionHeader } from '@/components/PageHeader'
import { PortfolioSummaryCards } from '@/components/portfolio/PortfolioSummaryCards'
import { CashCard } from '@/components/portfolio/CashCard'
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

  const cashAccount = (await CashAccount.findOne({ key: 'default' }).lean()) as {
    fundsAdded?: number
  } | null
  const cash = computeCash(
    cashAccount?.fundsAdded ?? 0,
    computeNetInvested(transactions),
  )

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Portfolio"
        description="Live holdings, P&L and history powered by Angel One."
        actions={<AddTransactionDialog />}
      />

      <PortfolioSummaryCards summary={summary} />

      <CashCard cash={cash} />

      <section className="space-y-3">
        <SectionHeader title="Holdings" />
        <HoldingsTable />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Analytics" />
        <PortfolioCharts />
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
