'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { formatIstTime } from '@/lib/format'
import { isMarketOpen } from '@/lib/time/marketHours'

// Shares the ['holdings'] query with HoldingsTable/PortfolioCharts, so the
// fetcher must return the full response shape — a narrower payload here would
// overwrite the shared cache entry and blank out the holdings table.
type HoldingsResponse = {
  holdings: unknown[]
  oldestFetchedAt: string | null
}

async function fetchHoldings(): Promise<HoldingsResponse> {
  const res = await fetch('/api/holdings', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to load holdings (${res.status})`)
  return (await res.json()) as HoldingsResponse
}

export function MarketStatusBadge() {
  const [open, setOpen] = useState<boolean>(() => isMarketOpen())

  useEffect(() => {
    const tick = () => setOpen(isMarketOpen())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const lastUpdatedQuery = useQuery({
    queryKey: ['holdings'],
    queryFn: fetchHoldings,
    staleTime: 30_000,
  })

  if (open) {
    return (
      <Badge variant="outline" className="text-foreground gap-1.5">
        <span className="relative flex size-1.5" aria-hidden="true">
          <span className="bg-gain/60 absolute inline-flex h-full w-full animate-ping rounded-full" />
          <span className="bg-gain relative inline-flex size-1.5 rounded-full" />
        </span>
        Market open
      </Badge>
    )
  }

  const lastUpdated = lastUpdatedQuery.data?.oldestFetchedAt ?? null

  return (
    <Badge variant="outline" className="text-muted-foreground gap-1.5">
      <span
        className="bg-muted-foreground/50 inline-block size-1.5 rounded-full"
        aria-hidden="true"
      />
      Market closed
      {lastUpdated ? (
        <span className="hidden lg:inline">
          · updated {formatIstTime(lastUpdated)}
        </span>
      ) : null}
    </Badge>
  )
}
