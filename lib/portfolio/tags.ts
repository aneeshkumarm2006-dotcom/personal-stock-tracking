import { HoldingTags } from '@/lib/db/models/HoldingTags'
import { WatchlistItem } from '@/lib/db/models/WatchlistItem'

export const MAX_TAGS_PER_HOLDING = 20
// Clarity alias: tags now apply to both holdings and watchlist items.
export const MAX_TAGS_PER_ITEM = MAX_TAGS_PER_HOLDING
export const MAX_TAG_LENGTH = 40

// Normalize a raw tag list: trim, collapse internal whitespace, drop empties,
// cap length, and dedupe case-insensitively (keeping the first spelling seen).
// This is what keeps "Swing" and "swing" from becoming two tags.
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const tag = item.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= MAX_TAGS_PER_HOLDING) break
  }
  return result
}

// Map of instrumentToken -> tags for the given tokens.
export async function loadTagsForTokens(
  tokens: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (tokens.length === 0) return map
  const docs = await HoldingTags.find({
    instrumentToken: { $in: tokens },
  }).lean()
  for (const d of docs) {
    map.set(d.instrumentToken, d.tags ?? [])
  }
  return map
}

// The distinct catalog of every tag in use, sorted case-insensitively.
// Powers tag suggestions/autocomplete in the editor. Unions tags from BOTH
// holdings and watchlist items so the two tabs share one vocabulary.
export async function getAllTags(): Promise<string[]> {
  const [holdingDocs, watchlistDocs] = await Promise.all([
    HoldingTags.find({}, { tags: 1 }).lean(),
    WatchlistItem.find({}, { tags: 1 }).lean(),
  ])
  const seen = new Set<string>()
  const result: string[] = []
  for (const d of [...holdingDocs, ...watchlistDocs]) {
    for (const tag of d.tags ?? []) {
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.push(tag)
    }
  }
  result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  return result
}
