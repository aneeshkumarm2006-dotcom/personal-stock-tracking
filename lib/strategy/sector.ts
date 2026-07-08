import { SectorCache } from '@/lib/db/models/SectorCache'
import { getFundamentals } from '@/lib/indianapi/fundamentals'
import { normalizeSymbol, sectorForSymbol } from '@/lib/portfolio/sectors'

// Batch-read the persistent long-tail cache for a set of RAW symbols. Returns a
// map keyed by NORMALIZED symbol -> sector, so callers look up with
// normalizeSymbol(rawSymbol). Only holds entries that were resolved live once;
// symbols covered by the offline maps never reach the cache.
export async function sectorsForSymbols(
  symbols: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const keys = [
    ...new Set(
      symbols
        .map((s) => (s ? normalizeSymbol(s) : ''))
        .filter((k) => k.length > 0),
    ),
  ]
  if (keys.length === 0) return new Map()
  const docs = await SectorCache.find({ symbol: { $in: keys } })
    .select('symbol sector')
    .lean()
  return new Map(docs.map((d) => [d.symbol, d.sector]))
}

// Resolve one symbol's sector, fetching from the provider only when the offline
// maps and the cache both miss. Best-effort: any provider error (not-found,
// auth, rate-limit) is swallowed and 'Other' is returned, so a resolve never
// throws and never stores a wrong guess. On a successful fetch the value is
// upserted into SectorCache so it's a one-time cost per symbol.
export async function resolveSectorLive(symbol: string): Promise<string> {
  const mapped = sectorForSymbol(symbol)
  if (mapped !== 'Other') return mapped

  const key = normalizeSymbol(symbol)
  if (!key) return 'Other'

  const cached = await SectorCache.findOne({ symbol: key }).select('sector').lean()
  if (cached?.sector) return cached.sector

  try {
    const fundamentals = await getFundamentals({ symbol })
    const industry = (fundamentals.industry ?? '').trim()
    if (industry) {
      await SectorCache.updateOne(
        { symbol: key },
        { $set: { symbol: key, sector: industry, source: 'indianapi' } },
        { upsert: true },
      )
      return industry
    }
  } catch {
    // Not found / auth / rate-limit — leave the symbol unresolved ('Other') and
    // let a later request try again.
  }
  return 'Other'
}
