'use client'

import { useQuery } from '@tanstack/react-query'
import { BarChart3Icon } from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { AnalystViewCard } from './AnalystViewCard'
import { CompanyProfileCard } from './CompanyProfileCard'
import { CorporateActionsCard } from './CorporateActionsCard'
import { FinancialsCard } from './FinancialsCard'
import { KeyRatiosCard } from './KeyRatiosCard'
import { NewsCard } from './NewsCard'
import { PeersCard } from './PeersCard'
import { ShareholdingCard } from './ShareholdingCard'
import type { Fundamentals } from './types'

// Returns null when the provider has no match (HTTP 404) so the UI can show a
// calm "not available" state instead of an error.
async function fetchFundamentals(
  symbol: string,
  name: string,
): Promise<Fundamentals | null> {
  const params = new URLSearchParams()
  if (symbol) params.set('symbol', symbol)
  if (name) params.set('name', name)
  const res = await fetch(`/api/research/fundamentals?${params.toString()}`, {
    credentials: 'include',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Fundamentals failed (${res.status})`)
  return (await res.json()) as Fundamentals
}

export type FundamentalsSectionProps = {
  symbol: string
  name: string
}

function SectionHeading() {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-heading flex items-center gap-2 text-lg font-semibold tracking-tight">
        <BarChart3Icon className="size-4" aria-hidden="true" />
        Fundamentals
      </h2>
      <span className="text-muted-foreground text-xs">via indianapi.in</span>
    </div>
  )
}

export function FundamentalsSection({ symbol, name }: FundamentalsSectionProps) {
  const query = useQuery({
    queryKey: ['research-fundamentals', symbol, name],
    queryFn: () => fetchFundamentals(symbol, name),
    enabled: !!(symbol || name),
    staleTime: 30 * 60_000, // fundamentals move slowly
    gcTime: 60 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  if (query.isLoading) {
    return (
      <section className="space-y-4">
        <SectionHeading />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </section>
    )
  }

  if (query.isError) {
    return (
      <section className="space-y-4">
        <SectionHeading />
        <ErrorState message="Couldn’t load fundamentals for this stock." />
      </section>
    )
  }

  // Resolved successfully but the provider has no coverage (indices, ETFs, many
  // SME/newly-listed scrips).
  if (!query.data) {
    return (
      <section className="space-y-4">
        <SectionHeading />
        <EmptyState
          icon={<BarChart3Icon />}
          title="No fundamentals available"
          description="The fundamentals provider doesn’t cover this instrument. This is common for indices, ETFs, and newly listed or SME stocks."
        />
      </section>
    )
  }

  const data = query.data

  return (
    <section className="space-y-6">
      <SectionHeading />

      <KeyRatiosCard data={data} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CompanyProfileCard data={data} />
        </div>
        <div className="lg:col-span-1">
          <AnalystViewCard data={data} />
        </div>
      </div>

      <FinancialsCard data={data} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ShareholdingCard data={data} />
        <CorporateActionsCard data={data} />
      </div>

      <PeersCard data={data} />
      <NewsCard data={data} />
    </section>
  )
}
