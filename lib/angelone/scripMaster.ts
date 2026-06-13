import { connectDB } from '@/lib/db/connect'
import { Instrument, type InstrumentDoc } from '@/lib/db/models/Instrument'

import { NetworkError } from './errors'

const SCRIP_MASTER_URL =
  'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json'

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

  const operations = rows
    .filter((row) => {
      const exchange = pickExchange(row.exch_seg)
      if (!exchange) return false
      if (!row.token || !row.symbol) return false
      return row.symbol.endsWith('-EQ')
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
              name: row.name ?? row.symbol!,
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
