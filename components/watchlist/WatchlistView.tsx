'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatIstTime } from '@/lib/format'
import {
  applyWatchlistFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
  type WatchlistFilterState,
} from '@/lib/watchlist/filter'
import type { WatchlistListResponse } from '@/lib/watchlist/types'
import { AddToWatchlistDialog } from './AddToWatchlistDialog'
import { WatchlistFilters } from './WatchlistFilters'
import { WatchlistTable } from './WatchlistTable'

async function fetchWatchlist(): Promise<WatchlistListResponse> {
  const res = await fetch('/api/watchlist', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to load watchlist (${res.status})`)
  return (await res.json()) as WatchlistListResponse
}

export function WatchlistView() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const query = useQuery({ queryKey: ['watchlist'], queryFn: fetchWatchlist })

  const [filters, setFilters] = useState<WatchlistFilterState>(() =>
    filtersFromSearchParams(new URLSearchParams(searchParams?.toString() ?? '')),
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkTag, setBulkTag] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  // Persist filter/sort state to the URL (debounced) so reopening restores it.
  useEffect(() => {
    const handle = setTimeout(() => {
      const qs = filtersToSearchParams(filters).toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, 300)
    return () => clearTimeout(handle)
  }, [filters, pathname, router])

  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const filtered = useMemo(
    () => applyWatchlistFilters(items, filters),
    [items, filters],
  )

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) for (const t of i.tags) set.add(t)
    return [...set].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  }, [items])

  const sectors = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) set.add(i.sector)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items])

  // Selection operates over the currently visible (filtered) rows.
  const allSelected =
    filtered.length > 0 &&
    filtered.every((i) => selected.has(i.instrumentToken))

  const toggleSelect = (token: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(token)) next.delete(token)
      else next.add(token)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const i of filtered) next.delete(i.instrumentToken)
      } else {
        for (const i of filtered) next.add(i.instrumentToken)
      }
      return next
    })
  }

  const selectedTokens = [...selected]

  const bulkRemove = async () => {
    if (selectedTokens.length === 0) return
    if (!window.confirm(`Remove ${selectedTokens.length} item(s) from the watchlist?`)) {
      return
    }
    setBulkBusy(true)
    try {
      const results = await Promise.all(
        selectedTokens.map((token) =>
          fetch(`/api/watchlist/${encodeURIComponent(token)}`, {
            method: 'DELETE',
            credentials: 'include',
          }).then((r) => r.ok),
        ),
      )
      const ok = results.filter(Boolean).length
      toast.success(`Removed ${ok} item(s)`)
      setSelected(new Set())
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] })
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkAddTag = async () => {
    const tag = bulkTag.trim().replace(/\s+/g, ' ')
    if (!tag || selectedTokens.length === 0) return
    setBulkBusy(true)
    try {
      const byToken = new Map(items.map((i) => [i.instrumentToken, i]))
      await Promise.all(
        selectedTokens.map((token) => {
          const item = byToken.get(token)
          const nextTags = [...(item?.tags ?? []), tag]
          return fetch(`/api/watchlist/${encodeURIComponent(token)}/tags`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: nextTags }),
          })
        }),
      )
      toast.success(`Tagged ${selectedTokens.length} item(s) "${tag}"`)
      setBulkTag('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['watchlist'] }),
        queryClient.invalidateQueries({ queryKey: ['tags'] }),
      ])
    } catch {
      toast.error('Network error')
    } finally {
      setBulkBusy(false)
    }
  }

  if (query.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />
  }
  if (query.isError) {
    return <ErrorState message="Unable to load your watchlist." />
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="Your watchlist is empty"
        description="Park a buy candidate, set a target, and get pinged when it gets there."
        action={<AddToWatchlistDialog />}
      />
    )
  }

  return (
    <div className="space-y-3">
      <WatchlistFilters
        filters={filters}
        onChange={setFilters}
        allTags={allTags}
        sectors={sectors}
      />

      {selectedTokens.length > 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <span className="text-sm font-medium">
            {selectedTokens.length} selected
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={bulkBusy}
            onClick={bulkRemove}
          >
            Remove
          </Button>
          <div className="flex items-center gap-1.5">
            <Input
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  bulkAddTag()
                }
              }}
              placeholder="Add tag to selected"
              className="h-8 w-44"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bulkBusy || !bulkTag.trim()}
              onClick={bulkAddTag}
            >
              Apply tag
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description="No watchlist items match the current filters."
        />
      ) : (
        <WatchlistTable
          items={filtered}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          allSelected={allSelected}
        />
      )}

      <p className="text-muted-foreground text-right text-xs">
        {filtered.length} of {items.length} shown · Last updated{' '}
        {formatIstTime(query.data?.oldestFetchedAt ?? null)}
      </p>
    </div>
  )
}
