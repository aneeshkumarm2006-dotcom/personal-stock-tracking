'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { formatIstTime } from '@/lib/format'
import { useRateLimitToast } from '@/lib/hooks/useRateLimitToast'
import { isMarketOpen } from '@/lib/time/marketHours'
import { cn } from '@/lib/utils'

// How often to pull fresh live quotes while the watchlist is open. Matches the
// strategy page so both surfaces feel equally live. The per-minute cron remains
// the backstop when no page is open; this tightens it for an active viewer.
// Kept well above Angel One's per-minute quote budget so an open page can't
// rate-limit itself.
const LIVE_REFRESH_INTERVAL_MS = 15_000

type RefreshOutcome = { rateLimited: boolean }

// Single shared poller for the Watchlist page. It drives the one expensive live
// fetch (Angel One quotes -> snapshots -> alert evaluation) and then invalidates
// the watchlist query so both the table and the triggered-alerts feed re-read
// the fresh prices. Rendering it once keeps the table and feed from each firing
// their own live fetch and tripping the rate limit.
export function WatchlistLivePrices() {
  const queryClient = useQueryClient()
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
    queryKey: ['watchlistLiveRefresh'],
    queryFn: async (): Promise<RefreshOutcome> => {
      const res = await fetch('/api/prices/refresh', {
        method: 'POST',
        credentials: 'include',
      })

      // Rate limited: keep the last good prices on screen and retry next tick.
      if (res.status === 503) return { rateLimited: true }
      if (!res.ok) throw new Error(`Live refresh failed (${res.status})`)

      // Fresh snapshots are persisted; pull the watchlist (table + alerts feed)
      // forward so every row and any newly triggered alert shows immediately.
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] })
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

  // Raise a bottom-right toast while Angel One is throttling; only meaningful
  // while the poller is actually running (market open).
  useRateLimitToast(open && (query.data?.rateLimited ?? false))

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
