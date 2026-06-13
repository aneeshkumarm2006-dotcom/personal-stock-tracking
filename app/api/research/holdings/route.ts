import { NextResponse } from 'next/server'

import { verifyResearchRequest } from '@/lib/auth/researchToken'
import { connectDB } from '@/lib/db/connect'
import { CashAccount } from '@/lib/db/models/CashAccount'
import { Transaction } from '@/lib/db/models/Transaction'
import { computeHoldings, type TransactionForHoldings } from '@/lib/portfolio/holdings'
import { computeCash, computeNetInvested } from '@/lib/portfolio/cash'
import { loadTagsForTokens } from '@/lib/portfolio/tags'
import { enrichHoldings } from '@/lib/portfolio/summary'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'

export const dynamic = 'force-dynamic'

// Read-only holdings feed for an external research agent (e.g. a scheduled
// Claude Code agent). Auth is a shared bearer token (RESEARCH_API_TOKEN), not
// the user session cookie, so it can be called headlessly from the cloud.
//
//   GET /api/research/holdings
//   Authorization: Bearer <RESEARCH_API_TOKEN>
//
// By default only open positions (netQty > 0) are returned, since closed
// positions are not actionable for research. Pass ?includeClosed=1 to include
// them.
export async function GET(request: Request) {
  const auth = verifyResearchRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status })
  }

  const includeClosed =
    new URL(request.url).searchParams.get('includeClosed') === '1'

  await connectDB()

  const transactions = (await Transaction.find({})
    .sort({ date: 1 })
    .lean()) as unknown as TransactionForHoldings[]

  const holdings = computeHoldings(transactions)
  const tokens = holdings.map((h) => h.instrumentToken)
  const [snapshots, tagsByToken, cashAccount] = await Promise.all([
    loadSnapshotsForTokens(tokens),
    loadTagsForTokens(tokens),
    CashAccount.findOne({ key: 'default' }).lean() as Promise<{
      fundsAdded?: number
    } | null>,
  ])
  const enriched = enrichHoldings(holdings, snapshots)

  // Uninvested buying power, so the agent can factor cash on hand into
  // allocation / new-position suggestions rather than assuming fully invested.
  const cash = computeCash(
    cashAccount?.fundsAdded ?? 0,
    computeNetInvested(transactions),
  )

  const selected = includeClosed
    ? enriched
    : enriched.filter((h) => !h.isClosed && h.netQty > 0)

  // Slim, research-oriented shape: symbol-first, with cost basis, the latest
  // price snapshot, and the user's intention tags so the agent can tailor
  // research to horizon (e.g. long-term vs swing) without a second call.
  const positions = selected.map((h) => ({
    symbol: h.instrumentSymbol,
    token: h.instrumentToken,
    quantity: h.netQty,
    avgBuyPrice: h.avgBuyPrice,
    invested: h.totalInvested,
    currentPrice: h.currentPrice,
    currentValue: h.currentValue,
    unrealizedPnL: h.unrealizedPnL,
    unrealizedPnLPct: h.unrealizedPnLPct,
    dayChangePct: h.dayChangePct,
    tags: tagsByToken.get(h.instrumentToken) ?? [],
    isClosed: h.isClosed,
  }))

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    count: positions.length,
    symbols: positions.map((p) => p.symbol).filter(Boolean),
    cash,
    positions,
  })
}
