'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Signal } from '@/lib/research/technicalRating'

// A TradingView-style speedometer gauge: a thin semicircular track that fills
// with a red→neutral→green gradient up to the needle (sell uses --loss, buy
// uses the site's --gain green), greys out beyond it, labels the five zones
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
const STROKE = 8
const NEEDLE_LEN = R - 16

// Red for sell, the site's green (--gain) for buy, grey track for the unfilled
// remainder.
const SELL = 'var(--loss)'
const BUY = 'var(--gain)'
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

  // The angle the needle should ultimately settle on: the raw target derived
  // from the score, or straight up (90°) when we have no data. Nothing the eye
  // follows is drawn from this directly — instead `displayAngle` below eases
  // toward it so a timeframe switch sweeps rather than snaps.
  const targetAngle = hasData ? scoreToAngle(score) : 90

  // The animated angle that chases `targetAngle`. It starts at the neutral
  // centre so the first mount plays a TradingView-style intro sweep up to the
  // score. Everything geometric (needle endpoint, fill arc, grey remainder) is
  // recomputed from this each render, keeping them in perfect lockstep.
  const [displayAngle, setDisplayAngle] = useState(90)

  // The in-flight rAF handle, plus a mirror of the latest displayed angle so a
  // fresh tween can pick up from wherever the needle currently sits without
  // re-subscribing the effect to `displayAngle` (which changes every frame).
  const frameRef = useRef<number | null>(null)
  const displayRef = useRef(90)

  useEffect(() => {
    // Cancel any tween still running so a rapid timeframe switch restarts from
    // the needle's current position rather than fighting the previous sweep.
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    const from = displayRef.current
    const to = targetAngle

    // Respect the user's reduced-motion preference — and skip the no-op case —
    // by jumping straight to the target with no tween. Guarded for SSR.
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion || from === to) {
      displayRef.current = to
      setDisplayAngle(to)
      return
    }

    // Ease-out cubic over ~0.7s: quick off the mark, gently decelerating onto
    // the new reading — the feel of the TradingView gauge settling.
    const DURATION_MS = 700
    const startedAt = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / DURATION_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = from + (to - from) * eased
      displayRef.current = current
      setDisplayAngle(current)
      frameRef.current = t < 1 ? requestAnimationFrame(tick) : null
    }

    frameRef.current = requestAnimationFrame(tick)

    // Cancel on unmount (and before the next tween) so no frame — and no state
    // update — fires after teardown.
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [targetAngle])

  // Needle endpoint and both arc paths derive from the *animated* angle so they
  // sweep together; the discrete bits (signal word, colour, rim highlight,
  // counts) still snap to the target props below.
  const [nx, ny] = polar(displayAngle, NEEDLE_LEN)
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
              left through white to green (buy) on the right. */}
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={CX - R}
            y1={CY}
            x2={CX + R}
            y2={CY}
          >
            <stop offset="0%" stopColor={SELL} />
            <stop offset="25%" stopColor={SELL} />
            <stop offset="50%" stopColor="white" />
            <stop offset="75%" stopColor={BUY} />
            <stop offset="100%" stopColor={BUY} />
          </linearGradient>
        </defs>

        {/* Grey remainder beyond the needle (or the whole track when no data). */}
        <path
          d={arcPath(hasData ? displayAngle : 180, 0)}
          fill="none"
          stroke={TRACK}
          strokeWidth={STROKE}
          strokeLinecap="butt"
        />

        {/* Coloured fill from Strong Sell up to the needle. */}
        {hasData && (
          <path
            d={arcPath(180, displayAngle)}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={STROKE}
            strokeLinecap="butt"
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
