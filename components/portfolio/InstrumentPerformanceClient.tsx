'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PriceHistoryLine,
  type PriceHistoryCandle,
  type PriceHistoryMarker,
} from '@/components/charts/PriceHistoryLine'
import { cn } from '@/lib/utils'

type RangeKey = '1M' | '3M' | '6M' | '1Y'

const RANGE_DAYS: Record<RangeKey, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
}

type CandleRow = {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type ApiTransaction = {
  _id: string
  type: 'BUY' | 'SELL'
  price: number
  date: string
}

export type InstrumentPerformanceClientProps = {
  token: string
  exchange: 'NSE' | 'BSE'
}

async function fetchCandles(
  token: string,
  exchange: 'NSE' | 'BSE',
  days: number,
): Promise<CandleRow[]> {
  const to = new Date()
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const params = new URLSearchParams({
    exchange,
    interval: 'ONE_DAY',
    from: from.toISOString(),
    to: to.toISOString(),
  })
  const res = await fetch(
    `/api/historical/${encodeURIComponent(token)}?${params.toString()}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as CandleRow[]
  return Array.isArray(data) ? data : []
}

async function fetchInstrumentTransactions(token: string): Promise<ApiTransaction[]> {
  const res = await fetch(
    `/api/transactions?instrumentToken=${encodeURIComponent(token)}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as ApiTransaction[]
  return Array.isArray(data) ? data : []
}

export function InstrumentPerformanceClient({
  token,
  exchange,
}: InstrumentPerformanceClientProps) {
  const [range, setRange] = useState<RangeKey>('3M')

  const candlesQuery = useQuery({
    queryKey: ['candles', token, exchange, range],
    queryFn: () => fetchCandles(token, exchange, RANGE_DAYS[range]),
  })

  const transactionsQuery = useQuery({
    queryKey: ['transactions', token],
    queryFn: () => fetchInstrumentTransactions(token),
  })

  const series: PriceHistoryCandle[] = useMemo(
    () =>
      (candlesQuery.data ?? []).map((c) => ({
        date: new Date(c.timestamp).toISOString().slice(0, 10),
        close: c.close,
      })),
    [candlesQuery.data],
  )

  const buyMarkers: PriceHistoryMarker[] = useMemo(() => {
    const transactions = transactionsQuery.data ?? []
    return transactions
      .filter((tx) => tx.type === 'BUY')
      .map((tx) => ({
        date: new Date(tx.date).toISOString().slice(0, 10),
        price: tx.price,
      }))
  }, [transactionsQuery.data])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {(Object.keys(RANGE_DAYS) as RangeKey[]).map((key) => (
          <Button
            key={key}
            type="button"
            variant={key === range ? 'default' : 'outline'}
            size="sm"
            className={cn(key === range && 'pointer-events-none')}
            onClick={() => setRange(key)}
          >
            {key}
          </Button>
        ))}
      </div>

      {candlesQuery.isLoading ? (
        <Skeleton className="h-[360px] w-full" />
      ) : candlesQuery.isError ? (
        <p className="text-destructive text-sm">Unable to load price history.</p>
      ) : series.length === 0 ? (
        <div className="text-muted-foreground flex h-[360px] items-center justify-center rounded-md border border-dashed text-sm">
          No price data returned for this range.
        </div>
      ) : (
        <PriceHistoryLine data={series} buyMarkers={buyMarkers} />
      )}
    </div>
  )
}
