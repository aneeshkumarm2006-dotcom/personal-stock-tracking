import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { CashAccount } from '@/lib/db/models/CashAccount'
import { Transaction } from '@/lib/db/models/Transaction'
import { computeHoldings, type TransactionForHoldings } from '@/lib/portfolio/holdings'
import { computeCash, computeNetInvested } from '@/lib/portfolio/cash'
import { computeSummary } from '@/lib/portfolio/summary'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'

export const dynamic = 'force-dynamic'

export async function GET() {
  await connectDB()

  const transactions = (await Transaction.find({})
    .sort({ date: 1 })
    .lean()) as unknown as TransactionForHoldings[]

  const holdings = computeHoldings(transactions)
  const tokens = holdings.map((h) => h.instrumentToken)
  const [snapshots, cashAccount] = await Promise.all([
    loadSnapshotsForTokens(tokens),
    CashAccount.findOne({ key: 'default' }).lean() as Promise<{
      fundsAdded?: number
      realizedPnLBaseline?: number
    } | null>,
  ])
  const summary = computeSummary(
    holdings,
    snapshots,
    cashAccount?.realizedPnLBaseline ?? 0,
  )
  const cash = computeCash(
    cashAccount?.fundsAdded ?? 0,
    computeNetInvested(transactions),
  )

  return NextResponse.json({ ...summary, cash })
}
