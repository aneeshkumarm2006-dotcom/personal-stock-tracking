import type { CSSProperties } from 'react'

/** Shared Recharts styling so every chart reads from the same design tokens. */

export const CHART_PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

export const axisTick = {
  fontSize: 11,
  fill: 'var(--muted-foreground)',
} as const

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: axisTick,
} as const

export const gridProps = {
  stroke: 'var(--border)',
  strokeDasharray: '3 3',
  vertical: false,
} as const

export const tooltipContentStyle: CSSProperties = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: '0 4px 12px rgb(0 0 0 / 0.06)',
  color: 'var(--popover-foreground)',
  fontSize: 12,
  padding: '8px 10px',
}

export const tooltipLabelStyle: CSSProperties = {
  color: 'var(--muted-foreground)',
  fontSize: 11,
  marginBottom: 2,
}

export const tooltipItemStyle: CSSProperties = {
  color: 'var(--popover-foreground)',
  padding: 0,
}

export const tooltipCursor = { fill: 'var(--muted)', opacity: 0.6 }

export const legendStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted-foreground)',
}

const inrAxisFormatter = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Compact axis labels: ₹1.2L, ₹45K, -₹2Cr — keeps Y axes narrow and quiet. */
export function formatAxisInr(value: number): string {
  if (!Number.isFinite(value)) return ''
  const sign = value < 0 ? '-' : ''
  return `${sign}₹${inrAxisFormatter.format(Math.abs(value))}`
}
