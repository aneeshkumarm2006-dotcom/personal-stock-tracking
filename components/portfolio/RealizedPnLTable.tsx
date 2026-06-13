'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatInt, formatPercent, pnlColorClass } from '@/lib/format'
import type { EnrichedHolding } from '@/lib/portfolio/summary'

type HoldingsResponse = {
  holdings: EnrichedHolding[]
}

type ApiTransaction = {
  _id: string
  instrumentToken: string
  instrumentSymbol?: string
  type: 'BUY' | 'SELL'
  quantity: number
  price: number
}

async function fetchHoldings(): Promise<HoldingsResponse> {
  const res = await fetch('/api/holdings', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  return (await res.json()) as HoldingsResponse
}

async function fetchTransactions(): Promise<ApiTransaction[]> {
  const res = await fetch('/api/transactions', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as ApiTransaction[]
  return Array.isArray(data) ? data : []
}

type Row = {
  instrumentToken: string
  instrumentSymbol: string
  qtySold: number
  avgBuyPrice: number
  avgSellPrice: number
  realizedPnL: number
  returnPct: number
}

export function RealizedPnLTable() {
  const holdingsQuery = useQuery({ queryKey: ['holdings'], queryFn: fetchHoldings })
  const transactionsQuery = useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
  })

  const rows: Row[] = useMemo(() => {
    const holdings = holdingsQuery.data?.holdings ?? []
    const transactions = transactionsQuery.data ?? []
    if (holdings.length === 0) return []

    const buyAgg = new Map<string, { qty: number; cost: number }>()
    const sellAgg = new Map<string, { qty: number; proceeds: number }>()

    for (const tx of transactions) {
      const bucket =
        tx.type === 'BUY'
          ? (buyAgg.get(tx.instrumentToken) ?? { qty: 0, cost: 0 })
          : (sellAgg.get(tx.instrumentToken) ?? { qty: 0, proceeds: 0 })
      if (tx.type === 'BUY') {
        bucket.qty += tx.quantity
        ;(bucket as { qty: number; cost: number }).cost += tx.quantity * tx.price
        buyAgg.set(tx.instrumentToken, bucket as { qty: number; cost: number })
      } else {
        bucket.qty += tx.quantity
        ;(bucket as { qty: number; proceeds: number }).proceeds += tx.quantity * tx.price
        sellAgg.set(tx.instrumentToken, bucket as { qty: number; proceeds: number })
      }
    }

    const out: Row[] = []
    for (const h of holdings) {
      const sell = sellAgg.get(h.instrumentToken)
      if (!sell || sell.qty === 0) continue

      const buy = buyAgg.get(h.instrumentToken)
      const avgBuyPrice = buy && buy.qty > 0 ? buy.cost / buy.qty : 0
      const avgSellPrice = sell.proceeds / sell.qty
      const basis = avgBuyPrice * sell.qty
      const returnPct = basis > 0 ? (h.realizedPnL / basis) * 100 : 0

      out.push({
        instrumentToken: h.instrumentToken,
        instrumentSymbol: h.instrumentSymbol || h.instrumentToken,
        qtySold: sell.qty,
        avgBuyPrice: Math.round(avgBuyPrice * 100) / 100,
        avgSellPrice: Math.round(avgSellPrice * 100) / 100,
        realizedPnL: h.realizedPnL,
        returnPct: Math.round(returnPct * 100) / 100,
      })
    }

    return out.sort((a, b) => b.realizedPnL - a.realizedPnL)
  }, [holdingsQuery.data, transactionsQuery.data])

  if (holdingsQuery.isLoading || transactionsQuery.isLoading) {
    return <Skeleton className="h-32 w-full rounded-lg" />
  }

  if (holdingsQuery.isError || transactionsQuery.isError) {
    return <ErrorState message="Unable to load realized P&L." />
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No realized P&L"
        description="Sell a holding to populate this table."
      />
    )
  }

  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead className="text-right">Qty Sold</TableHead>
            <TableHead className="text-right">Avg Buy Price</TableHead>
            <TableHead className="text-right">Avg Sell Price</TableHead>
            <TableHead className="text-right">Realized P&L</TableHead>
            <TableHead className="text-right">Return %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.instrumentToken}>
              <TableCell className="font-medium">{r.instrumentSymbol}</TableCell>
              <TableCell className="text-right">{formatInt(r.qtySold)}</TableCell>
              <TableCell className="text-right">{formatCurrency(r.avgBuyPrice)}</TableCell>
              <TableCell className="text-right">{formatCurrency(r.avgSellPrice)}</TableCell>
              <TableCell className={`text-right ${pnlColorClass(r.realizedPnL)}`}>
                {formatCurrency(r.realizedPnL)}
              </TableCell>
              <TableCell className={`text-right ${pnlColorClass(r.returnPct)}`}>
                {formatPercent(r.returnPct)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
