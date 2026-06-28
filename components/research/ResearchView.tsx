'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LineChartIcon } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { computeAnalytics } from '@/lib/research/analytics'
import { isMarketOpen } from '@/lib/time/marketHours'
import { FundamentalsSection } from './fundamentals/FundamentalsSection'
import { MarketDepthCard } from './MarketDepthCard'
import { QuoteHeader } from './QuoteHeader'
import { QuoteStats } from './QuoteStats'
import { ResearchPriceChart } from './ResearchPriceChart'
import { ResearchSearch } from './ResearchSearch'
import { TechnicalRatingCard } from './TechnicalRatingCard'
import { TechnicalsCard } from './TechnicalsCard'
import type { CandleRow, Quote, SelectedInstrument } from './types'

// How often to repull the live quote while the market is open. Matches the other
// live surfaces and stays well under Angel One's quote budget (10 req/sec).
const LIVE_REFRESH_INTERVAL_MS = 15_000
// One ONE_DAY request covers ~5 years (max 2000 days) — enough for the chart's
// longest range and every computed metric (SMA 200 needs ~10 months).
const DAILY_LOOKBACK_DAYS = 1825

async function fetchFullQuote(
  token: string,
  exchange: 'NSE' | 'BSE',
): Promise<Quote> {
  const res = await fetch(
    `/api/quote/full?token=${encodeURIComponent(token)}&exchange=${exchange}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`Quote failed (${res.status})`)
  return (await res.json()) as Quote
}

async function fetchDailyCandles(
  token: string,
  exchange: 'NSE' | 'BSE',
): Promise<CandleRow[]> {
  const to = new Date()
  const from = new Date(Date.now() - DAILY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
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
  if (!res.ok) throw new Error(`History failed (${res.status})`)
  const data = (await res.json()) as CandleRow[]
  return Array.isArray(data) ? data : []
}

export type ResearchViewProps = {
  initial: SelectedInstrument | null
}

export function ResearchView({ initial }: ResearchViewProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<SelectedInstrument | null>(initial)
  const [marketOpen, setMarketOpen] = useState<boolean>(() => isMarketOpen())

  useEffect(() => {
    const tick = () => setMarketOpen(isMarketOpen())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  function handleSelect(instrument: SelectedInstrument) {
    setSelected(instrument)
    const params = new URLSearchParams({
      token: instrument.token,
      exchange: instrument.exchange,
      symbol: instrument.symbol,
      name: instrument.name,
    })
    // Keep the URL shareable / refresh-safe without a full navigation.
    router.replace(`/research?${params.toString()}`, { scroll: false })
  }

  const token = selected?.token
  const exchange = selected?.exchange ?? 'NSE'

  const quoteQuery = useQuery({
    queryKey: ['research-quote', token, exchange],
    queryFn: () => fetchFullQuote(token!, exchange),
    enabled: !!token,
    refetchInterval: marketOpen ? LIVE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: marketOpen ? 0 : 60_000,
    retry: false,
  })

  const dailyQuery = useQuery({
    queryKey: ['research-daily', token, exchange],
    queryFn: () => fetchDailyCandles(token!, exchange),
    enabled: !!token,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const analytics = useMemo(
    () => computeAnalytics(dailyQuery.data ?? []),
    [dailyQuery.data],
  )

  if (!selected) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="space-y-2 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Research</h1>
          <p className="text-muted-foreground text-sm">
            Search any NSE/BSE stock to see its live price, market depth, history,
            and company fundamentals.
          </p>
        </div>
        <div className="mt-6">
          <ResearchSearch onSelect={handleSelect} autoFocus />
        </div>
        <Card className="mt-8" size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <LineChartIcon className="size-4" aria-hidden="true" />
              What you&apos;ll see
            </CardTitle>
            <CardDescription>
              Live LTP, OHLC, 52-week range, circuit limits, volume, and the best-5
              market-depth ladder — plus computed returns, moving averages,
              volatility and drawdown from daily history, and full company
              fundamentals: P/E and valuation ratios, financial statements,
              shareholding, peers, analyst ratings and news.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const quote = quoteQuery.data
  const quoteLoading = quoteQuery.isLoading

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <ResearchSearch onSelect={handleSelect} />

      <QuoteHeader
        instrument={selected}
        quote={quote}
        marketOpen={marketOpen}
        isFetching={quoteQuery.isFetching}
        isError={quoteQuery.isError}
      />

      <Card>
        <CardHeader>
          <CardTitle>Price chart</CardTitle>
          <CardDescription>Daily closes with volume; switch ranges or view the latest intraday session.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResearchPriceChart
            token={selected.token}
            exchange={selected.exchange}
            dailyCandles={dailyQuery.data ?? []}
            dailyLoading={dailyQuery.isLoading}
            dailyError={dailyQuery.isError}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <QuoteStats quote={quote} isLoading={quoteLoading} isError={quoteQuery.isError} />
        </div>
        <div className="lg:col-span-1">
          <MarketDepthCard quote={quote} isLoading={quoteLoading} isError={quoteQuery.isError} />
        </div>
      </div>

      <TechnicalsCard
        analytics={analytics}
        quote={quote}
        isLoading={dailyQuery.isLoading}
      />

      <TechnicalRatingCard
        candles={dailyQuery.data ?? []}
        isLoading={dailyQuery.isLoading}
        isError={dailyQuery.isError}
      />

      <FundamentalsSection symbol={selected.symbol} name={selected.name} />
    </div>
  )
}
