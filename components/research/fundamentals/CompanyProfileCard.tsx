'use client'

import { useState } from 'react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Fundamentals } from './types'

function Meta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  )
}

export function CompanyProfileCard({ data }: { data: Fundamentals }) {
  const [expanded, setExpanded] = useState(false)
  const { description, officers } = data

  return (
    <Card>
      <CardHeader>
        <CardTitle>About {data.companyName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Meta label="Industry" value={data.industry} />
          <Meta label="ISIN" value={data.isin} />
          <Meta label="NSE" value={data.nseCode} />
          <Meta label="BSE" value={data.bseCode} />
        </dl>

        {description && (
          <div>
            <p className={cn('text-sm leading-relaxed', !expanded && 'line-clamp-4')}>
              {description}
            </p>
            {description.length > 280 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-muted-foreground hover:text-foreground mt-1 text-xs font-medium underline-offset-4 hover:underline"
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}

        {officers.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-medium">Key management</h3>
            <ul className="ring-foreground/10 divide-foreground/10 divide-y overflow-hidden rounded-lg ring-1">
              {officers.slice(0, 6).map((o, i) => (
                <li key={`${o.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate text-sm font-medium">{o.name}</span>
                  <span className="text-muted-foreground shrink-0 text-right text-xs">
                    {o.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
