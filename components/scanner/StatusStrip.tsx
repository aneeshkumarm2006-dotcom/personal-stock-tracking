import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { StatusLevel } from '@/lib/scanner/freshness'

// The "Right now" strip both scanner tabs lead with — three colored-dot checks
// (engine running? · data up to date? · today's decision) so the first glance
// answers "is it working and what did it decide". Presentational only: server
// components and 'use client' children both render it.

const DOT: Record<StatusLevel, string> = {
  ok: 'bg-gain',
  warn: 'bg-amber-500',
  down: 'bg-loss',
  muted: 'bg-muted-foreground/40',
}

export type StatusItem = {
  label: string
  value: ReactNode
  sub?: ReactNode
  level: StatusLevel
  // Ping animation for "happening right this second" (live runner, open trade).
  pulse?: boolean
}

export function StatusStrip({ items }: { items: StatusItem[] }) {
  return (
    <div className="bg-card ring-foreground/10 grid gap-x-6 gap-y-4 rounded-xl p-4 ring-1 sm:grid-cols-3 sm:p-5">
      {items.map((item) => (
        <div key={item.label} className="flex items-start gap-2.5">
          <span className="relative mt-[5px] flex h-2.5 w-2.5 shrink-0">
            {item.pulse && (
              <span
                className={cn(
                  'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                  DOT[item.level],
                )}
              />
            )}
            <span
              className={cn(
                'relative inline-flex h-2.5 w-2.5 rounded-full',
                DOT[item.level],
              )}
            />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              {item.label}
            </p>
            <div className="text-sm leading-snug font-medium">{item.value}</div>
            {item.sub != null && (
              <div className="text-muted-foreground text-xs leading-snug">
                {item.sub}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
