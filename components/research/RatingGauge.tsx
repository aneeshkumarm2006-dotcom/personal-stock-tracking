'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'
import type { Signal } from '@/lib/research/technicalRating'

// A TradingView-style speedometer gauge: a thin semicircular track that fills
// with a red→purple→blue gradient up to the needle (the buy side is blue, not
// green, to match TradingView), greys out beyond it, labels the five zones
// around the rim, and prints the signal word beneath. Pure SVG — no chart lib —
// so it scales cleanly and stays a single accessible <figure>.

export type RatingGaugeProps = {
  title: string
  score: number | null // [-1, 1]
  signal: Signal | null
  buy: number
  neutral: number
  sell: number
  emphasis?: boolean
}

const CX = 150
const CY = 132
const R = 82
const STROKE = 13
const NEEDLE_LEN = R - 16

// TradingView palette: red for sell, blue for buy, grey track for the unfilled
// remainder.
const SELL = '#f23645'
const BUY = '#2962ff'
const TRACK = 'var(--border)'

// score ∈ [-1,1] → angle in degrees, 0° = right (Strong Buy), 180° = left
// (Strong Sell), 90° = straight up (Neutral).
function scoreToAngle(score: number): number {
  return 90 * (1 - Math.max(-1, Math.min(1, score)))
}

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [CX + radius * Math.cos(rad), CY - radius * Math.sin(rad)]
}

function arcPath(aStart: number, aEnd: number): string {
  const [x0, y0] = polar(aStart, R)
  const [x1, y1] = polar(aEnd, R)
  // We sweep from the larger angle to the smaller one (left → right), which is
  // clockwise in screen space because the y-axis is flipped.
  const largeArc = Math.abs(aStart - aEnd) > 180 ? 1 : 0
  return `M ${x0} ${y0} A ${R} ${R} 0 ${largeArc} 1 ${x1} ${y1}`
}

function signalColor(signal: Signal | null): string {
  if (signal === 'Strong Buy' || signal === 'Buy') return BUY
  if (signal === 'Strong Sell' || signal === 'Sell') return SELL
  return 'var(--muted-foreground)'
}

// The five rim labels, ordered left (sell) → right (buy). `key` matches the
// lower-cased, de-spaced signal so we can highlight the active one.
const LABELS: Array<{ key: string; text: string; x: number; y: number }> = [
  { key: 'strongsell', text: 'Strong sell', x: 40, y: 152 },
  { key: 'sell', text: 'Sell', x: 70, y: 74 },
  { key: 'neutral', text: 'Neutral', x: 150, y: 40 },
  { key: 'buy', text: 'Buy', x: 230, y: 74 },
  { key: 'strongbuy', text: 'Strong buy', x: 260, y: 152 },
]

export function RatingGauge({
  title,
  score,
  signal,
  buy,
  neutral,
  sell,
  emphasis = false,
}: RatingGaugeProps) {
  const gradientId = useId()
  const hasData = score !== null && signal !== null
  const angle = hasData ? scoreToAngle(score) : 90
  const [nx, ny] = polar(angle, NEEDLE_LEN)
  const color = signalColor(signal)
  const activeKey = hasData ? signal!.toLowerCase().replace(/\s+/g, '') : null

  const ariaLabel = hasData
    ? `${title}: ${signal}. ${buy} buy, ${neutral} neutral, ${sell} sell signals.`
    : `${title}: not enough data.`

  return (
    <figure role="img" aria-label={ariaLabel} className="flex flex-col items-center gap-1">
      <figcaption className="text-foreground text-sm font-semibold">{title}</figcaption>
      <svg
        viewBox="0 0 300 180"
        className={cn('w-full', emphasis ? 'max-w-[280px]' : 'max-w-[240px]')}
      >
        <defs>
          {/* Horizontal gradient across the arc's bounding box; because the
              arc's x-position tracks its angle, this reads red (sell) on the
              left through purple to blue (buy) on the right. */}
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={CX - R}
            y1={CY}
            x2={CX + R}
            y2={CY}
          >
            <stop offset="0%" stopColor="#ffc2c7" />
            <stop offset="18%" stopColor={SELL} />
            <stop offset="50%" stopColor="#9450c9" />
            <stop offset="82%" stopColor="#3f6ef2" />
            <stop offset="100%" stopColor={BUY} />
          </linearGradient>
        </defs>

        {/* Grey remainder beyond the needle (or the whole track when no data). */}
        <path
          d={arcPath(hasData ? angle : 180, 0)}
          fill="none"
          stroke={TRACK}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />

        {/* Coloured fill from Strong Sell up to the needle. */}
        {hasData && (
          <path
            d={arcPath(180, angle)}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        )}

        {/* Rim labels. */}
        {LABELS.map((l) => {
          const active = l.key === activeKey
          return (
            <text
              key={l.key}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              fontSize={11}
              fontWeight={active ? 600 : 500}
              fill={active ? color : 'color-mix(in oklch, var(--muted-foreground) 60%, transparent)'}
              style={{ fontFamily: 'inherit' }}
            >
              {l.text}
            </text>
          )
        })}

        {/* Needle. */}
        {hasData && (
          <>
            <line
              x1={CX}
              y1={CY}
              x2={nx}
              y2={ny}
              stroke="var(--foreground)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={CX} cy={CY} r={5} fill="var(--foreground)" />
          </>
        )}

        {/* Signal word. */}
        <text
          x={CX}
          y={170}
          textAnchor="middle"
          fontSize={emphasis ? 22 : 19}
          fontWeight={700}
          fill={color}
          style={{ fontFamily: 'inherit' }}
        >
          {signal ?? '—'}
        </text>
      </svg>

      <div className="flex items-start gap-6 text-center">
        <div>
          <div className="text-foreground text-xs font-semibold">Sell</div>
          <div className="text-foreground text-sm font-semibold tabular-nums">{sell}</div>
        </div>
        <div>
          <div className="text-foreground text-xs font-semibold">Neutral</div>
          <div className="text-foreground text-sm font-semibold tabular-nums">{neutral}</div>
        </div>
        <div>
          <div className="text-foreground text-xs font-semibold">Buy</div>
          <div className="text-foreground text-sm font-semibold tabular-nums">{buy}</div>
        </div>
      </div>
    </figure>
  )
}
