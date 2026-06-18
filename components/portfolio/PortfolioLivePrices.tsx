'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { formatIstTime } from '@/lib/format'
import { isMarketOpen } from '@/lib/time/marketHours'
import { cn } from '@/lib/utils'

// How often to pull fresh live quotes while the portfolio is open. Matches the
// watchlist and strategy pages so every surface feels equally live. The
// per-minute cron skips holdings (see lib/prices/refresh.ts), so this poller is
// what keeps the portfolio current while someone is actually watching it. Kept
// well above Angel One's per-minute quote budget so an open page can't
// rate-limit itself.
const LIVE_REFRESH_INTERVAL_MS = 15_000

type RefreshOutcome = { rateLimited: boolean }

// Single shared poller for the Portfolio page. It drives the live fetch (Angel
// One quotes -> snapshots), then pulls the table forward via the ['holdings']
// query and refreshes the route so the server-rendered summary and cash cards
// re-read the fresh prices too.
export function PortfolioLivePrices() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [open, setOpen] = useState<boolean>(() => isMarketOpen())

  // Re-check market hours each minute so the poller pauses itself at the close
  // and resumes at the next open without needing a page reload.
  useEffect(() => {
    const tick = () => setOpen(isMarketOpen())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const query = useQuery({
    queryKey: ['portfolioLiveRefresh'],
    queryFn: async (): Promise<RefreshOutcome> => {
      const res = await fetch('/api/prices/refresh', {
        method: 'POST',
        credentials: 'include',
      })

      // Rate limited: keep the last good prices on screen and retry next tick.
      if (res.status === 503) return { rateLimited: true }
      if (!res.ok) throw new Error(`Live refresh failed (${res.status})`)

      // Holdings table reads the ['holdings'] query; the summary + cash cards are
      // server-rendered, so refresh the route to pull their fresh values too.
      await queryClient.invalidateQueries({ queryKey: ['holdings'] })
      router.refresh()
      return { rateLimited: false }
    },
    // Only run while the market is open and the tab is in the foreground, so we
    // never spend quote quota after hours or in a backgrounded tab.
    enabled: open,
    refetchInterval: open ? LIVE_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const lastUpdated =
    query.dataUpdatedAt > 0 ? formatIstTime(new Date(query.dataUpdatedAt)) : null

  let label: string
  if (!open) {
    label = 'Live updates paused · market closed'
  } else if (query.isFetching) {
    label = 'Updating live prices…'
  } else if (query.data?.rateLimited) {
    label = 'Rate limited — retrying shortly'
  } else if (lastUpdated) {
    label = `Live · prices updated ${lastUpdated}`
  } else {
    label = 'Connecting to live prices…'
  }

  return (
    <div
      className="text-muted-foreground flex items-center gap-2 text-xs"
      aria-live="polite"
    >
      <span
        className={cn(
          'inline-block size-1.5 rounded-full',
          open ? 'bg-gain' : 'bg-muted-foreground/40',
          open && query.isFetching && 'animate-pulse',
        )}
        aria-hidden="true"
      />
      {label}
    </div>
  )
}
