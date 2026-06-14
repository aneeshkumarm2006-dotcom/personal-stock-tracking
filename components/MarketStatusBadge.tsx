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

// Reads wall-clock time in IST regardless of the viewer's local timezone.
function getIstTime() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { hours: get('hour'), minutes: get('minute'), seconds: get('second') }
}

// Tiny analog clock whose hands track the real IST time, ticking each second.
function IstAnalogClock() {
  const [now, setNow] = useState(getIstTime)

  useEffect(() => {
    const id = setInterval(() => setNow(getIstTime()), 1000)
    return () => clearInterval(id)
  }, [])

  const secondAngle = now.seconds * 6
  const minuteAngle = now.minutes * 6 + now.seconds * 0.1
  const hourAngle = (now.hours % 12) * 30 + now.minutes * 0.5

  const hand = (angle: number, length: number) => {
    const rad = (angle * Math.PI) / 180
    return { x2: 12 + length * Math.sin(rad), y2: 12 - length * Math.cos(rad) }
  }

  const hour = hand(hourAngle, 4.5)
  const minute = hand(minuteAngle, 6.5)
  const second = hand(secondAngle, 7.5)

  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      fill="none"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.35"
      />
      <line
        x1="12"
        y1="12"
        x2={hour.x2}
        y2={hour.y2}
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <line
        x1="12"
        y1="12"
        x2={minute.x2}
        y2={minute.y2}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="12"
        y1="12"
        x2={second.x2}
        y2={second.y2}
        className="stroke-gain"
        strokeWidth="1"
      />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    </svg>
  )
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
      <IstAnalogClock />
      Market closed
      {lastUpdated ? (
        <span className="hidden lg:inline">
          · updated {formatIstTime(lastUpdated)}
        </span>
      ) : null}
    </Badge>
  )
}
