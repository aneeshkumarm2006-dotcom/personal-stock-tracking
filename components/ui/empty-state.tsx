import * as React from 'react'

import { cn } from '@/lib/utils'

export type EmptyStateProps = React.ComponentProps<'div'> & {
  title?: string
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
}

function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex min-h-36 flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-card/50 px-6 py-10 text-center',
        className
      )}
      {...props}
    >
      {icon ? (
        <div className="text-muted-foreground/70 mb-2 [&_svg]:size-5" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      {title ? <p className="text-sm font-medium">{title}</p> : null}
      {description ? (
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      ) : null}
      {children}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

function ErrorState({
  message = 'Something went wrong.',
  className,
  ...props
}: React.ComponentProps<'div'> & { message?: string }) {
  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        'border-destructive/30 bg-destructive/5 text-destructive flex min-h-20 items-center justify-center rounded-lg border border-dashed px-6 py-6 text-center text-sm',
        className
      )}
      {...props}
    >
      {message}
    </div>
  )
}

export { EmptyState, ErrorState }
