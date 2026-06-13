'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { XIcon } from 'lucide-react'
import { toast } from 'sonner'

import { formatCurrency, formatIstTime } from '@/lib/format'
import type { WatchlistListResponse } from '@/lib/watchlist/types'

async function fetchWatchlist(): Promise<WatchlistListResponse> {
  const res = await fetch('/api/watchlist', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  return (await res.json()) as WatchlistListResponse
}

type FeedEntry = {
  key: string
  token: string
  alertId: string
  symbol: string
  price: number | null
  at: string
}

export function TriggeredAlertsFeed() {
  const queryClient = useQueryClient()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const query = useQuery({ queryKey: ['watchlist'], queryFn: fetchWatchlist })

  const entries = useMemo<FeedEntry[]>(() => {
    const items = query.data?.items ?? []
    const out: FeedEntry[] = []
    for (const item of items) {
      for (const alert of item.alerts) {
        if (alert.status !== 'triggered' || !alert.lastTriggeredAt) continue
        out.push({
          key: `${item.instrumentToken}:${alert._id}`,
          token: item.instrumentToken,
          alertId: alert._id,
          symbol: item.instrumentSymbol || item.instrumentToken,
          price: alert.lastTriggeredPrice,
          at: alert.lastTriggeredAt,
        })
      }
    }
    out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    return out
  }, [query.data])

  const visible = entries.filter((e) => !dismissed.has(e.key))
  if (visible.length === 0) return null

  const rearm = async (entry: FeedEntry) => {
    try {
      const res = await fetch(
        `/api/watchlist/${encodeURIComponent(entry.token)}/alerts/${entry.alertId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'armed' }),
        },
      )
      if (!res.ok) {
        toast.error(`Failed to re-arm (${res.status})`)
        return
      }
      toast.success('Alert re-armed')
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    } catch {
      toast.error('Network error')
    }
  }

  return (
    <div className="bg-card rounded-lg border p-3">
      <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
        Recently triggered
      </p>
      <ul className="flex flex-col gap-1.5">
        {visible.map((entry) => (
          <li
            key={entry.key}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span>
              <span className="font-medium">{entry.symbol}</span> hit{' '}
              {formatCurrency(entry.price)} at {formatIstTime(entry.at)}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                onClick={() => rearm(entry)}
              >
                Re-arm
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setDismissed((prev) => new Set(prev).add(entry.key))
                }
              >
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
