'use client'

import { SearchIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DEFAULT_FILTERS,
  type SortKey,
  type WatchlistFilterState,
} from '@/lib/watchlist/filter'

const SORT_LABELS: Record<SortKey, string> = {
  symbol: 'Symbol',
  dayChange: 'Day %',
  distance: 'Distance to target',
  conviction: 'Conviction',
  recentlyAdded: 'Recently added',
  recentlyTriggered: 'Recently triggered',
}

export type WatchlistFiltersProps = {
  filters: WatchlistFilterState
  onChange: (next: WatchlistFilterState) => void
  allTags: string[]
  sectors: string[]
}

export function WatchlistFilters({
  filters,
  onChange,
  allTags,
  sectors,
}: WatchlistFiltersProps) {
  const set = (partial: Partial<WatchlistFilterState>) =>
    onChange({ ...filters, ...partial })

  const toggleTag = (tag: string) => {
    const has = filters.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
    set({
      tags: has
        ? filters.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...filters.tags, tag],
    })
  }

  return (
    <div className="bg-card space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search symbol or name"
            className="pl-8"
          />
        </div>

        <Select value={filters.exchange} onValueChange={(v) => set({ exchange: v as WatchlistFilterState['exchange'] })}>
          <SelectTrigger aria-label="Exchange">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All exchanges</SelectItem>
            <SelectItem value="NSE">NSE</SelectItem>
            <SelectItem value="BSE">BSE</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.sector} onValueChange={(v) => set({ sector: v ?? 'all' })}>
          <SelectTrigger aria-label="Sector">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.conviction}
          onValueChange={(v) => set({ conviction: v as WatchlistFilterState['conviction'] })}
        >
          <SelectTrigger aria-label="Conviction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any conviction</SelectItem>
            <SelectItem value="watching">Watching</SelectItem>
            <SelectItem value="interested">Interested</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.alertStatus}
          onValueChange={(v) => set({ alertStatus: v as WatchlistFilterState['alertStatus'] })}
        >
          <SelectTrigger aria-label="Alert status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any alerts</SelectItem>
            <SelectItem value="armed">Has armed</SelectItem>
            <SelectItem value="triggered">Triggered</SelectItem>
            <SelectItem value="snoozed">Snoozed</SelectItem>
            <SelectItem value="none">No alerts</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Tags:</span>
          {allTags.map((tag) => {
            const active = filters.tags.some(
              (t) => t.toLowerCase() === tag.toLowerCase(),
            )
            return (
              <Badge
                key={tag}
                variant={active ? 'default' : 'outline'}
                className="cursor-pointer"
                render={<button type="button" onClick={() => toggleTag(tag)} />}
              >
                {tag}
              </Badge>
            )
          })}
          {filters.tags.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() =>
                set({ tagMode: filters.tagMode === 'and' ? 'or' : 'and' })
              }
            >
              Match: {filters.tagMode === 'and' ? 'all' : 'any'}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="border-input size-3.5 rounded"
            checked={filters.nearTarget}
            onChange={(e) => set({ nearTarget: e.target.checked })}
          />
          Within
          <Input
            type="number"
            min={0}
            step="0.5"
            value={filters.nearTargetPct}
            onChange={(e) =>
              set({ nearTargetPct: Number(e.target.value) || 0 })
            }
            className="h-7 w-16"
            aria-label="Near target percent"
          />
          % of target
        </label>

        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="border-input size-3.5 rounded"
            checked={filters.hideInPortfolio}
            onChange={(e) => set({ hideInPortfolio: e.target.checked })}
          />
          Hide in portfolio
        </label>

        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="border-input size-3.5 rounded"
            checked={filters.hideInStrategy}
            onChange={(e) => set({ hideInStrategy: e.target.checked })}
          />
          Hide in strategy
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          <Label className="text-muted-foreground text-xs">Sort</Label>
          <Select
            value={filters.sortKey}
            onValueChange={(v) => set({ sortKey: v as SortKey })}
          >
            <SelectTrigger size="sm" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Sort ${filters.sortDir === 'asc' ? 'ascending' : 'descending'}`}
            onClick={() =>
              set({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })
            }
          >
            {filters.sortDir === 'asc' ? '↑' : '↓'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...DEFAULT_FILTERS, tags: [] })}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}
