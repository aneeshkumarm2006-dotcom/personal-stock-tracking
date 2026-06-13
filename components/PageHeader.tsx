import * as React from 'react'

import { cn } from '@/lib/utils'

export type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-3',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}

export function SectionHeader({
  title,
  hint,
  actions,
  className,
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1',
        className
      )}
    >
      <h2 className="font-heading text-base font-semibold tracking-tight">
        {title}
      </h2>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {actions}
    </div>
  )
}
