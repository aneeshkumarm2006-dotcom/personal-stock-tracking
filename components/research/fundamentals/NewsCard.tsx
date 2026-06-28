'use client'

import { ArrowUpRightIcon } from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { fmtDate } from './format'
import type { Fundamentals } from './types'

export function NewsCard({ data }: { data: Fundamentals }) {
  if (data.news.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent news</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-foreground/10 divide-y">
          {data.news.map((n, i) => (
            <li key={`${n.url}-${i}`} className="py-3 first:pt-0 last:pb-0">
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-1"
              >
                <span className="flex items-start gap-1.5 text-sm font-medium group-hover:underline">
                  {n.headline}
                  <ArrowUpRightIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                </span>
                {n.summary && (
                  <span className="text-muted-foreground line-clamp-2 text-xs">{n.summary}</span>
                )}
                {n.date && (
                  <span className="text-muted-foreground/70 text-xs">{fmtDate(n.date)}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
