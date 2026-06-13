import { connectDB } from '@/lib/db/connect'
import { Instrument, type InstrumentDoc } from '@/lib/db/models/Instrument'

import { NetworkError } from './errors'

const SCRIP_MASTER_URL =
  'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json'

// NSE's official equity list maps each trading symbol to the full company name.
// AngelOne's scrip master only carries the short symbol in its `name` field, so we
// enrich from here to make searching by company name (e.g. "state bank" -> SBIN) work.
const NSE_EQUITY_LIST_URL =
  'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv'

// Trading symbols in the scrip master are suffixed (e.g. "SBIN-EQ"); NSE's list keys
// on the bare symbol ("SBIN"). Strip the suffix to line the two up.
function baseSymbol(symbol: string): string {
  const dash = symbol.lastIndexOf('-')
  return (dash === -1 ? symbol : symbol.slice(0, dash)).toUpperCase()
}

/**
 * Parse NSE's EQUITY_L.csv into a `symbol -> company name` map.
 * The file is unquoted CSV (company names never contain commas), so a plain
 * split on the first two commas is sufficient and robust.
 */
export function parseNseCompanyNames(csv: string): Map<string, string> {
  const map = new Map<string, string>()
  const lines = csv.split(/\r?\n/)
  // Skip the header row (index 0).
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim()
    if (!line) continue
    const firstComma = line.indexOf(',')
    if (firstComma === -1) continue
    const symbol = line.slice(0, firstComma).trim().toUpperCase()
    const rest = line.slice(firstComma + 1)
    const secondComma = rest.indexOf(',')
    const name = (secondComma === -1 ? rest : rest.slice(0, secondComma)).trim()
    if (symbol && name) map.set(symbol, name)
  }
  return map
}

/** Resolve the best display/search name for an instrument, preferring NSE company names. */
export function resolveInstrumentName(
  symbol: string,
  angelName: string | undefined,
  companyNames: Map<string, string>,
): string {
  return companyNames.get(baseSymbol(symbol)) ?? angelName ?? symbol
}

// Best-effort fetch of NSE company names. Enrichment failures must not break the
// scrip-master refresh, so any error falls back to an empty map (AngelOne short names).
async function fetchNseCompanyNames(): Promise<Map<string, string>> {
  try {
    const response = await fetch(NSE_EQUITY_LIST_URL, {
      headers: {
        // NSE rejects requests without a browser-like User-Agent.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Accept: 'text/csv,*/*',
      },
    })
    if (!response.ok) return new Map()
    return parseNseCompanyNames(await response.text())
  } catch {
    return new Map()
  }
}

type RawScripRow = {
  token?: string
  symbol?: string
  name?: string
  exch_seg?: string
  instrumenttype?: string
}

type Exchange = 'NSE' | 'BSE'

function pickExchange(value: string | undefined): Exchange | null {
  if (value === 'NSE' || value === 'BSE') return value
  return null
}

export async function refreshScripMaster(): Promise<number> {
  await connectDB()

  let response: Response
  try {
    response = await fetch(SCRIP_MASTER_URL, {
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    throw new NetworkError('Failed to fetch scrip master', err)
  }

  if (!response.ok) {
    throw new NetworkError(`Scrip master fetch returned HTTP ${response.status}`)
  }

  const rows = (await response.json()) as RawScripRow[]
  if (!Array.isArray(rows)) {
    throw new NetworkError('Scrip master response was not an array')
  }

  const companyNames = await fetchNseCompanyNames()

  const operations = rows
    .filter((row) => {
      const exchange = pickExchange(row.exch_seg)
      if (!exchange) return false
      if (!row.token || !row.symbol) return false
      // Cash-segment equities only: derivatives carry an instrumenttype
      // (FUTSTK, OPTSTK, ...); cash equities leave it blank.
      if (row.instrumenttype) return false
      if (exchange === 'NSE') {
        // NSE suffixes the series: EQ (rolling), BE/BZ (trade-to-trade),
        // SM/ST (SME). All are tradeable equities; only -EQ was kept before,
        // which silently dropped BE-series stocks like PREMIERPOL-BE.
        return /-(EQ|BE|BZ|SM|ST)$/.test(row.symbol)
      }
      // BSE equities carry the bare symbol with no series suffix.
      return !row.symbol.includes('-')
    })
    .map((row) => {
      const exchange = pickExchange(row.exch_seg) as Exchange
      return {
        updateOne: {
          filter: { token: row.token! },
          update: {
            $set: {
              token: row.token!,
              symbol: row.symbol!,
              name: resolveInstrumentName(row.symbol!, row.name, companyNames),
              exchange,
            },
          },
          upsert: true,
        },
      }
    })

  if (operations.length === 0) return 0

  const BATCH = 1000
  let upserted = 0
  for (let i = 0; i < operations.length; i += BATCH) {
    const slice = operations.slice(i, i + BATCH)
    const result = await Instrument.bulkWrite(slice, { ordered: false })
    upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
  }

  return upserted
}

export async function searchInstruments(
  query: string,
  limit = 20,
): Promise<InstrumentDoc[]> {
  await connectDB()
  const trimmed = query.trim()
  if (!trimmed) return []

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'i')

  return Instrument.find({
    $or: [{ symbol: regex }, { name: regex }],
  })
    .limit(limit)
    .lean<InstrumentDoc[]>()
}
