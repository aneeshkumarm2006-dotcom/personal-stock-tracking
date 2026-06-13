import type { Conviction, WatchlistItemView } from '@/lib/watchlist/types'

export type SortKey =
  | 'symbol'
  | 'dayChange'
  | 'distance'
  | 'conviction'
  | 'recentlyAdded'
  | 'recentlyTriggered'

export type SortDir = 'asc' | 'desc'

export type AlertStatusFilter = 'any' | 'armed' | 'triggered' | 'snoozed' | 'none'

export type WatchlistFilterState = {
  search: string
  tags: string[]
  tagMode: 'and' | 'or'
  exchange: 'all' | 'NSE' | 'BSE'
  sector: string
  conviction: 'all' | Conviction
  alertStatus: AlertStatusFilter
  nearTarget: boolean
  nearTargetPct: number
  hideInPortfolio: boolean
  hideInStrategy: boolean
  sortKey: SortKey
  sortDir: SortDir
}

export const DEFAULT_FILTERS: WatchlistFilterState = {
  search: '',
  tags: [],
  tagMode: 'or',
  exchange: 'all',
  sector: 'all',
  conviction: 'all',
  alertStatus: 'any',
  nearTarget: false,
  nearTargetPct: 5,
  hideInPortfolio: false,
  hideInStrategy: false,
  sortKey: 'recentlyAdded',
  sortDir: 'desc',
}

const CONVICTION_RANK: Record<Conviction, number> = {
  watching: 0,
  interested: 1,
  high: 2,
}

function matchesAlertStatus(
  item: WatchlistItemView,
  f: AlertStatusFilter,
): boolean {
  switch (f) {
    case 'any':
      return true
    case 'none':
      return item.alerts.length === 0
    case 'armed':
      return item.armedCount > 0
    case 'triggered':
      return item.triggeredCount > 0
    case 'snoozed':
      return item.alerts.some((a) => a.status === 'snoozed')
  }
}

function latestTriggeredAt(item: WatchlistItemView): number {
  let max = 0
  for (const a of item.alerts) {
    if (a.lastTriggeredAt) {
      const t = new Date(a.lastTriggeredAt).getTime()
      if (Number.isFinite(t) && t > max) max = t
    }
  }
  return max
}

// Compare helper that always sorts `null`/missing values to the end,
// independent of sort direction.
function compareNullable(
  a: number | null,
  b: number | null,
  dir: SortDir,
): number {
  const aNull = a === null
  const bNull = b === null
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  return dir === 'asc' ? a - b : b - a
}

// Pure: filter then sort the watchlist rows for display. Kept side-effect-free
// so the toolbar stays thin and this stays unit-testable.
export function applyWatchlistFilters(
  items: WatchlistItemView[],
  f: WatchlistFilterState,
): WatchlistItemView[] {
  const search = f.search.trim().toLowerCase()
  const selectedTags = f.tags.map((t) => t.toLowerCase())

  const filtered = items.filter((item) => {
    if (search) {
      const hay = `${item.instrumentSymbol} ${item.name}`.toLowerCase()
      if (!hay.includes(search)) return false
    }

    if (selectedTags.length > 0) {
      const itemTags = item.tags.map((t) => t.toLowerCase())
      const has = (t: string) => itemTags.includes(t)
      if (f.tagMode === 'and' ? !selectedTags.every(has) : !selectedTags.some(has)) {
        return false
      }
    }

    if (f.exchange !== 'all' && item.exchange !== f.exchange) return false
    if (f.sector !== 'all' && item.sector !== f.sector) return false
    if (f.conviction !== 'all' && item.conviction !== f.conviction) return false
    if (!matchesAlertStatus(item, f.alertStatus)) return false

    if (f.nearTarget) {
      if (item.distanceToTargetPct === null) return false
      if (Math.abs(item.distanceToTargetPct) > f.nearTargetPct) return false
    }

    if (f.hideInPortfolio && item.inPortfolio) return false
    if (f.hideInStrategy && item.inStrategy) return false

    return true
  })

  const dir = f.sortDir
  const sorted = [...filtered].sort((a, b) => {
    switch (f.sortKey) {
      case 'symbol': {
        const cmp = a.instrumentSymbol.localeCompare(b.instrumentSymbol)
        return dir === 'asc' ? cmp : -cmp
      }
      case 'dayChange':
        return compareNullable(a.dayChangePct, b.dayChangePct, dir)
      case 'distance':
        return compareNullable(
          a.distanceToTargetPct === null ? null : Math.abs(a.distanceToTargetPct),
          b.distanceToTargetPct === null ? null : Math.abs(b.distanceToTargetPct),
          dir,
        )
      case 'conviction':
        return dir === 'asc'
          ? CONVICTION_RANK[a.conviction] - CONVICTION_RANK[b.conviction]
          : CONVICTION_RANK[b.conviction] - CONVICTION_RANK[a.conviction]
      case 'recentlyAdded': {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dir === 'asc' ? at - bt : bt - at
      }
      case 'recentlyTriggered': {
        const at = latestTriggeredAt(a)
        const bt = latestTriggeredAt(b)
        return dir === 'asc' ? at - bt : bt - at
      }
    }
  })

  return sorted
}

// --- URL persistence (compact: only non-default values are serialized) ---

export function filtersToSearchParams(f: WatchlistFilterState): URLSearchParams {
  const p = new URLSearchParams()
  if (f.search) p.set('q', f.search)
  if (f.tags.length) p.set('tags', f.tags.join(','))
  if (f.tagMode !== DEFAULT_FILTERS.tagMode) p.set('tagMode', f.tagMode)
  if (f.exchange !== DEFAULT_FILTERS.exchange) p.set('ex', f.exchange)
  if (f.sector !== DEFAULT_FILTERS.sector) p.set('sector', f.sector)
  if (f.conviction !== DEFAULT_FILTERS.conviction) p.set('conv', f.conviction)
  if (f.alertStatus !== DEFAULT_FILTERS.alertStatus) p.set('alert', f.alertStatus)
  if (f.nearTarget) p.set('near', '1')
  if (f.nearTargetPct !== DEFAULT_FILTERS.nearTargetPct) {
    p.set('nearPct', String(f.nearTargetPct))
  }
  if (f.hideInPortfolio) p.set('hidePf', '1')
  if (f.hideInStrategy) p.set('hideSt', '1')
  if (f.sortKey !== DEFAULT_FILTERS.sortKey) p.set('sort', f.sortKey)
  if (f.sortDir !== DEFAULT_FILTERS.sortDir) p.set('dir', f.sortDir)
  return p
}

const SORT_KEYS: SortKey[] = [
  'symbol',
  'dayChange',
  'distance',
  'conviction',
  'recentlyAdded',
  'recentlyTriggered',
]
const ALERT_FILTERS: AlertStatusFilter[] = [
  'any',
  'armed',
  'triggered',
  'snoozed',
  'none',
]

export function filtersFromSearchParams(
  params: URLSearchParams,
): WatchlistFilterState {
  const f: WatchlistFilterState = { ...DEFAULT_FILTERS, tags: [] }
  const q = params.get('q')
  if (q) f.search = q
  const tags = params.get('tags')
  if (tags) f.tags = tags.split(',').filter(Boolean)
  if (params.get('tagMode') === 'and') f.tagMode = 'and'
  const ex = params.get('ex')
  if (ex === 'NSE' || ex === 'BSE') f.exchange = ex
  const sector = params.get('sector')
  if (sector) f.sector = sector
  const conv = params.get('conv')
  if (conv === 'watching' || conv === 'interested' || conv === 'high') {
    f.conviction = conv
  }
  const alert = params.get('alert')
  if (alert && ALERT_FILTERS.includes(alert as AlertStatusFilter)) {
    f.alertStatus = alert as AlertStatusFilter
  }
  if (params.get('near') === '1') f.nearTarget = true
  const nearPct = Number(params.get('nearPct'))
  if (Number.isFinite(nearPct) && nearPct > 0) f.nearTargetPct = nearPct
  if (params.get('hidePf') === '1') f.hideInPortfolio = true
  if (params.get('hideSt') === '1') f.hideInStrategy = true
  const sort = params.get('sort')
  if (sort && SORT_KEYS.includes(sort as SortKey)) f.sortKey = sort as SortKey
  if (params.get('dir') === 'asc') f.sortDir = 'asc'
  return f
}
