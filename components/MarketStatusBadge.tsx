'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { formatIstTime } from '@/lib/format'
import { isMarketOpen } from '@/lib/time/marketHours'

type HoldingsResponse = {
  oldestFetchedAt: string | null
}

async function fetchOldestFetchedAt(): Promise<string | null> {
  const res = await fetch('/api/holdings', { credentials: 'include' })
  if (!res.ok) return null
  const data = (await res.json()) as HoldingsResponse
  return data.oldestFetchedAt
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
    queryFn: async () => ({ oldestFetchedAt: await fetchOldestFetchedAt() }),
    staleTime: 30_000,
  })

  if (open) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      >
        <span
          className="mr-1 inline-block size-1.5 rounded-full bg-emerald-500"
          aria-hidden="true"
        />
        Market Open
      </Badge>
    )
  }

  const lastUpdated = lastUpdatedQuery.data?.oldestFetchedAt ?? null
  const suffix = lastUpdated ? ` · Last updated ${formatIstTime(lastUpdated)}` : ''

  return (
    <Badge variant="outline" className="text-muted-foreground">
      <span
        className="mr-1 inline-block size-1.5 rounded-full bg-muted-foreground"
        aria-hidden="true"
      />
      Market Closed{suffix}
    </Badge>
  )
}
