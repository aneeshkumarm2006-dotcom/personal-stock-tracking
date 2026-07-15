import { CashAccount } from '@/lib/db/models/CashAccount'
import { Transaction } from '@/lib/db/models/Transaction'
import {
  computeHoldings,
  type TransactionForHoldings,
} from '@/lib/portfolio/holdings'
import { computeCash, computeNetInvested, type CashSummary } from '@/lib/portfolio/cash'
import { computeSummary, type PortfolioSummary } from '@/lib/portfolio/summary'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'

export type PortfolioSummaryResponse = PortfolioSummary & { cash: CashSummary }

// Single source of truth for the portfolio summary + cash payload. Shared by the
// `/api/portfolio/summary` route and the server-rendered portfolio page (which
// passes it to PortfolioSummaryStrip as initialData). Caller must have an active
// DB connection (connectDB) before invoking.
export async function loadPortfolioSummary(): Promise<PortfolioSummaryResponse> {
  const transactions = (await Transaction.find({})
    .sort({ date: 1 })
    .lean()) as unknown as TransactionForHoldings[]

  const holdings = computeHoldings(transactions)
  const tokens = holdings.map((h) => h.instrumentToken)
  const [snapshots, cashAccount] = await Promise.all([
    loadSnapshotsForTokens(tokens),
    CashAccount.findOne({ key: 'default' }).lean() as Promise<{
      fundsAdded?: number
    } | null>,
  ])
  const summary = computeSummary(holdings, snapshots)
  const cash = computeCash(
    cashAccount?.fundsAdded ?? 0,
    computeNetInvested(transactions),
  )

  return { ...summary, cash }
}
