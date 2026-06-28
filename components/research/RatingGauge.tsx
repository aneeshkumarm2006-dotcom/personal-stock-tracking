'use client'

import { cn } from '@/lib/utils'
import type { Signal } from '@/lib/research/technicalRating'

// A TradingView-style semicircular gauge: a 5-zone arc (Strong Sell → Strong
// Buy) with a needle at the rating score, the signal word in the centre, and
// Sell / Neutral / Buy tallies beneath. Pure SVG — no chart lib — so it scales
// cleanly and stays a single accessible <figure>.

export type RatingGaugeProps = {
  title: string
  score: number | null // [-1, 1]
  signal: Signal | null
  buy: number
  neutral: number
  sell: number
  emphasis?: boolean
}

const CX = 100
const CY = 104
const R = 82
const STROKE = 18

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
  // aStart > aEnd (we sweep left→right, i.e. decreasing angle = clockwise in
  // screen space because the y-axis is flipped).
  const sweep = 1
  const largeArc = Math.abs(aStart - aEnd) > 180 ? 1 : 0
  return `M ${x0} ${y0} A ${R} ${R} 0 ${largeArc} ${sweep} ${x1} ${y1}`
}

// The 5 zones in angle space, from left (sell) to right (buy). A small gap keeps
// the segments visually distinct.
const GAP = 1.5
const ZONES: Array<{ from: number; to: number; color: string }> = [
  { from: 180, to: 135, color: 'var(--loss)' }, // Strong Sell
  { from: 135, to: 99, color: 'color-mix(in oklch, var(--loss) 55%, transparent)' }, // Sell
  { from: 99, to: 81, color: 'color-mix(in oklch, var(--muted-foreground) 45%, transparent)' }, // Neutral
  { from: 81, to: 45, color: 'color-mix(in oklch, var(--gain) 55%, transparent)' }, // Buy
  { from: 45, to: 0, color: 'var(--gain)' }, // Strong Buy
]

function signalColor(signal: Signal | null): string {
  if (signal === 'Strong Buy' || signal === 'Buy') return 'var(--gain)'
  if (signal === 'Strong Sell' || signal === 'Sell') return 'var(--loss)'
  return 'var(--muted-foreground)'
}

export function RatingGauge({
  title,
  score,
  signal,
  buy,
  neutral,
  sell,
  emphasis = false,
}: RatingGaugeProps) {
  const hasData = score !== null && signal !== null
  const angle = hasData ? scoreToAngle(score) : 90
  const [nx, ny] = polar(angle, R - 6)
  const color = signalColor(signal)

  const ariaLabel = hasData
    ? `${title}: ${signal}. ${buy} buy, ${neutral} neutral, ${sell} sell signals.`
    : `${title}: not enough data.`

  return (
    <figure
      role="img"
      aria-label={ariaLabel}
      className="flex flex-col items-center gap-1"
    >
      <figcaption className="text-muted-foreground text-xs font-medium">{title}</figcaption>
      <svg viewBox="0 0 200 128" className={cn('w-full', emphasis ? 'max-w-[240px]' : 'max-w-[200px]')}>
        {ZONES.map((z, i) => (
          <path
            key={i}
            d={arcPath(z.from - (i === 0 ? 0 : GAP), z.to + (i === ZONES.length - 1 ? 0 : GAP))}
            fill="none"
            stroke={z.color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
          />
        ))}

        {hasData && (
          <>
            <line
              x1={CX}
              y1={CY}
              x2={nx}
              y2={ny}
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <circle cx={CX} cy={CY} r={6} fill={color} />
          </>
        )}

        <text
          x={CX}
          y={emphasis ? 84 : 86}
          textAnchor="middle"
          className={cn('font-semibold', emphasis ? 'text-[15px]' : 'text-[13px]')}
          fill={color}
          style={{ fontFamily: 'inherit' }}
        >
          {signal ?? '—'}
        </text>
      </svg>

      <div className="text-muted-foreground flex items-center gap-3 text-xs tabular-nums">
        <span>
          <span className="text-loss font-semibold">{sell}</span> Sell
        </span>
        <span>
          <span className="text-foreground font-semibold">{neutral}</span> Neutral
        </span>
        <span>
          <span className="text-gain font-semibold">{buy}</span> Buy
        </span>
      </div>
    </figure>
  )
}
