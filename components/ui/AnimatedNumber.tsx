'use client'

import { useEffect, useRef, useState } from 'react'

import { formatCurrency, formatInt, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

type FormatKind = 'currency' | 'percent' | 'int'

// Formatters are referenced by name (not passed as props) so AnimatedNumber can
// be rendered from server components too — functions can't cross the RSC
// boundary, plain strings can.
const FORMATTERS: Record<FormatKind, (n: number | null | undefined) => string> = {
  currency: formatCurrency,
  percent: formatPercent,
  int: formatInt,
}

export type AnimatedNumberProps = {
  value: number | null | undefined
  format: FormatKind
  className?: string
  // When true, a colored wash sweeps over the figure each time it changes —
  // green (bottom→top) on an increase, red (top→bottom) on a decrease. Reserved
  // for the headline summary numbers; the holdings table only counts.
  flash?: boolean
  durationMs?: number
}

// ease-in-out cubic: gentle start, quick middle, gentle settle.
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function AnimatedNumber({
  value,
  format,
  className,
  flash = false,
  durationMs = 700,
}: AnimatedNumberProps) {
  const target =
    typeof value === 'number' && Number.isFinite(value) ? value : null

  const [display, setDisplay] = useState<number | null>(target)
  // The currently-shown numeric value, read synchronously when a new target
  // arrives so a fresh tween starts from wherever the last one left off.
  const displayRef = useRef<number | null>(target)
  const rafRef = useRef<number | null>(null)
  const [flashDir, setFlashDir] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    const from = displayRef.current

    // First paint, value cleared, or no change: snap and skip the tween.
    if (target == null || from == null || from === target) {
      displayRef.current = target
      setDisplay(target)
      return
    }

    if (flash) setFlashDir(target > from ? 'up' : 'down')

    if (prefersReducedMotion()) {
      displayRef.current = target
      setDisplay(target)
      return
    }

    const startVal = from
    const delta = target - from
    const startTime = performance.now()

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs)
      const current = startVal + delta * easeInOut(t)
      displayRef.current = current
      setDisplay(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        displayRef.current = target
        setDisplay(target)
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [target, durationMs, flash])

  // Unmount the wash once it has played so the next change can replay it.
  useEffect(() => {
    if (!flashDir) return
    const id = setTimeout(() => setFlashDir(null), 750)
    return () => clearTimeout(id)
  }, [flashDir])

  const text = FORMATTERS[format](display)

  if (!flash) {
    return <span className={cn('tabular-nums', className)}>{text}</span>
  }

  return (
    <span className={cn('relative inline-block tabular-nums', className)}>
      {flashDir ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -inset-x-2 -inset-y-1 rounded-md',
            flashDir === 'up'
              ? 'animate-flash-up bg-gain/25'
              : 'animate-flash-down bg-loss/25',
          )}
        />
      ) : null}
      <span className="relative">{text}</span>
    </span>
  )
}
