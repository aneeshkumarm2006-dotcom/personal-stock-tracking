'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { formatIstTime } from '@/lib/format'
import type { EnrichedHolding } from '@/lib/portfolio/summary'
import { isMarketOpen } from '@/lib/time/marketHours'

// Shares the ['holdings'] query with HoldingsTable/PortfolioCharts, so the
// fetcher must return the full response shape — a narrower payload here would
// overwrite the shared cache entry and blank out the holdings table.
type HoldingsResponse = {
  holdings: EnrichedHolding[]
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

// Value-weighted day direction: positive when the portfolio is up on the day.
// Holdings without a live day-change snapshot are skipped; defaults to "up"
// (neutral green) when there's nothing to measure yet.
function isPortfolioUp(holdings: EnrichedHolding[]): boolean {
  let weighted = 0
  for (const h of holdings) {
    if (h.dayChangePct == null) continue
    weighted += h.currentValue * h.dayChangePct
  }
  return weighted >= 0
}

// A tiny live ticker line: a zigzag that scrolls sideways while gently bobbing,
// tilted up (green) when the portfolio is up on the day and down (red) when not.
function MarketTrendChart({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 24 16"
      className={`h-4 w-6 shrink-0 ${up ? 'text-gain' : 'text-loss'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* static tilt sets the up/down trend slope */}
      <g transform={up ? 'rotate(-12 12 8)' : 'rotate(12 12 8)'}>
        {/* gentle directional bob */}
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values={up ? '0 1; 0 -1; 0 1' : '0 -1; 0 1; 0 -1'}
            keyTimes="0; 0.5; 1"
            dur="5s"
            calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
            repeatCount="indefinite"
          />
          {/* seamless sideways scroll (shifts exactly two zigzag periods) */}
          <g>
            <animateTransform
              attributeName="transform"
              type="translate"
              from="0 0"
              to="-16 0"
              dur="4s"
              repeatCount="indefinite"
            />
            <polyline points="-16,8 -12,4 -8,8 -4,4 0,8 4,4 8,8 12,4 16,8 20,4 24,8 28,4 32,8 36,4 40,8" />
          </g>
        </g>
      </g>
    </svg>
  )
}

// Tiny analog clock whose hands track the real IST time, ticking each second.
function IstAnalogClock() {
  // Start from a fixed time so the server and the client's first render agree
  // (reading the live clock during render would mismatch by however many
  // seconds elapse between the two and trip a hydration warning). The real
  // time is set right after mount.
  const [now, setNow] = useState({ hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    setNow(getIstTime())
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
    const up = isPortfolioUp(lastUpdatedQuery.data?.holdings ?? [])
    return (
      <Badge variant="outline" className="text-foreground gap-1.5">
        <MarketTrendChart up={up} />
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
