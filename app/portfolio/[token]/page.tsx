import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon } from 'lucide-react'

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
import { EmptyState } from '@/components/ui/empty-state'
import { InstrumentPerformanceClient } from '@/components/portfolio/InstrumentPerformanceClient'
import { InstrumentNotesCard } from '@/components/portfolio/InstrumentNotesCard'
import { HoldingAlertsCard } from '@/components/portfolio/HoldingAlertsCard'
import { formatCurrency, formatInt, formatPercent, pnlColorClass } from '@/lib/format'
import { cn } from '@/lib/utils'

const STAT_CELL_BORDERS = [
  'border-b border-r lg:border-b-0',
  'border-b lg:border-r lg:border-b-0',
  'border-r lg:border-r',
  '',
]

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

  const stats = holding
    ? [
        { label: 'Net quantity', value: formatInt(holding.netQty) },
        { label: 'Avg buy price', value: formatCurrency(holding.avgBuyPrice) },
        { label: 'Current value', value: formatCurrency(holding.currentValue) },
        {
          label: 'Unrealized P&L',
          value: formatCurrency(holding.unrealizedPnL),
          hint: formatPercent(holding.unrealizedPnLPct),
          valueClass: pnlColorClass(holding.unrealizedPnL),
        },
      ]
    : []

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-2">
        <Link
          href="/portfolio"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
        >
          <ArrowLeftIcon className="size-3" aria-hidden="true" />
          Back to portfolio
        </Link>
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
            {instrument.symbol}
          </h1>
          <p className="text-muted-foreground text-sm">
            {instrument.name ?? instrument.symbol} · {exchange} · Token {token}
          </p>
        </div>
      </header>

      {holding ? (
        <dl className="bg-card ring-foreground/10 grid grid-cols-2 overflow-hidden rounded-xl ring-1 lg:grid-cols-4">
          {stats.map((s, idx) => (
            <div key={s.label} className={cn('px-4 py-3.5', STAT_CELL_BORDERS[idx])}>
              <dt className="text-muted-foreground text-xs">{s.label}</dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                <span
                  className={cn(
                    'text-lg leading-tight font-semibold tracking-tight tabular-nums',
                    s.valueClass
                  )}
                >
                  {s.value}
                </span>
                {s.hint ? (
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      s.valueClass ?? 'text-muted-foreground'
                    )}
                  >
                    {s.hint}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <EmptyState
          title="No transactions yet"
          description="Nothing has been recorded for this instrument."
        />
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

      <HoldingAlertsCard
        token={token}
        instrumentSymbol={instrument.symbol}
        exchange={exchange}
        ltp={holding?.currentPrice ?? null}
      />

      <InstrumentNotesCard token={token} instrumentSymbol={instrument.symbol} />
    </div>
  )
}
