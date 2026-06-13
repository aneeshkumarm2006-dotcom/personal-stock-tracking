'use client'

import { useQuery } from '@tanstack/react-query'

import type { Exchange } from '@/lib/watchlist/types'

type CandleRow = { timestamp: string; close: number }

// ~30 calendar days of daily closes for the row's mini price line.
async function fetchSparkline(
  token: string,
  exchange: Exchange,
): Promise<number[]> {
  const to = new Date()
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
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
  if (!res.ok) return []
  const data = (await res.json()) as CandleRow[]
  if (!Array.isArray(data)) return []
  return data
    .map((c) => c.close)
    .filter((n) => typeof n === 'number' && Number.isFinite(n))
}

export type WatchlistSparklineProps = {
  token: string
  exchange: Exchange
}

// A tiny, dependency-free SVG sparkline. Cached for an hour so a watchlist of
// any reasonable size stays cheap (one historical call per token per hour).
export function WatchlistSparkline({ token, exchange }: WatchlistSparklineProps) {
  const query = useQuery({
    queryKey: ['sparkline', token, exchange],
    queryFn: () => fetchSparkline(token, exchange),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  })

  const closes = query.data ?? []
  const first = closes[0]
  const last = closes[closes.length - 1]

  if (query.isLoading) {
    return <span className="text-muted-foreground/40 text-xs" aria-hidden="true">·</span>
  }
  if (closes.length < 2 || first === undefined || last === undefined) {
    return <span className="text-muted-foreground/40 text-xs" aria-hidden="true">—</span>
  }

  const w = 88
  const h = 24
  const pad = 2
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const stepX = (w - pad * 2) / (closes.length - 1)
  const points = closes
    .map((c, i) => {
      const x = pad + i * stepX
      const y = pad + (h - pad * 2) * (1 - (c - min) / range)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const up = last >= first

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="30-day price trend"
    >
      <polyline
        points={points}
        fill="none"
        stroke={up ? 'var(--gain)' : 'var(--loss)'}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
