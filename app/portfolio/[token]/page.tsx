import Link from 'next/link'
import { notFound } from 'next/navigation'

import { connectDB } from '@/lib/db/connect'
import { Instrument } from '@/lib/db/models/Instrument'
import { Transaction } from '@/lib/db/models/Transaction'
import {
  computeHoldings,
  type TransactionForHoldings,
} from '@/lib/portfolio/holdings'
import { enrichHoldings } from '@/lib/portfolio/summary'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InstrumentPerformanceClient } from '@/components/portfolio/InstrumentPerformanceClient'
import { formatCurrency, formatInt, formatPercent, pnlColorClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ token: string }> }

export default async function InstrumentPage({ params }: PageProps) {
  const { token: rawToken } = await params
  const token = decodeURIComponent(rawToken)
  if (!token) notFound()

  await connectDB()

  const instrument = await Instrument.findOne({ token }).lean()
  if (!instrument) notFound()

  const exchange = instrument.exchange === 'BSE' ? 'BSE' : 'NSE'

  const transactions = (await Transaction.find({ instrumentToken: token })
    .sort({ date: 1 })
    .lean()) as unknown as TransactionForHoldings[]

  const holdings = computeHoldings(transactions)
  const snapshots = await loadSnapshotsForTokens([token])
  const enriched = enrichHoldings(holdings, snapshots)
  const holding = enriched[0]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/portfolio"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← Back to portfolio
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {instrument.symbol}
        </h1>
        <p className="text-muted-foreground text-sm">
          {instrument.name ?? instrument.symbol} · {exchange} · Token {token}
        </p>
      </header>

      {holding ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Net quantity</CardDescription>
              <CardTitle>{formatInt(holding.netQty)}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Avg buy price</CardDescription>
              <CardTitle>{formatCurrency(holding.avgBuyPrice)}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Current value</CardDescription>
              <CardTitle>{formatCurrency(holding.currentValue)}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Unrealized P&L</CardDescription>
              <CardTitle className={pnlColorClass(holding.unrealizedPnL)}>
                {formatCurrency(holding.unrealizedPnL)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className={`text-xs ${pnlColorClass(holding.unrealizedPnLPct)}`}>
                {formatPercent(holding.unrealizedPnLPct)}
              </span>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No transactions recorded for this instrument yet.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Price history</CardTitle>
          <CardDescription>
            Daily closes from Angel One. Green dots mark your BUY transactions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InstrumentPerformanceClient token={token} exchange={exchange} />
        </CardContent>
      </Card>
    </div>
  )
}
