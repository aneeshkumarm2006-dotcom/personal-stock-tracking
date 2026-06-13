import { AuthError } from '@/lib/angelone/errors'
import { getQuotes, type ExchangeTokens } from '@/lib/angelone/quotes'
import { getValidSession, invalidateSession } from '@/lib/angelone/session'
import { Instrument } from '@/lib/db/models/Instrument'
import { PriceSnapshot } from '@/lib/db/models/PriceSnapshot'

// Best-effort live price for a single token, used when an entry is created to
// decide its trigger type and to reject orders that would fill immediately.
//
// Tries a fresh Angel One quote first; on any failure (auth, rate limit,
// network) it falls back to the most recent stored snapshot. Returns null when
// no price can be determined — callers must treat that as "unknown", never zero.
export async function fetchReferencePrice(token: string): Promise<number | null> {
  const fresh = await fetchFreshLtp(token)
  if (fresh != null) return fresh

  const snap = await PriceSnapshot.findOne({ token }, { ltp: 1, _id: 0 }).lean()
  return typeof snap?.ltp === 'number' && Number.isFinite(snap.ltp) ? snap.ltp : null
}

async function fetchFreshLtp(token: string): Promise<number | null> {
  try {
    const inst = await Instrument.findOne({ token }, { exchange: 1, _id: 0 }).lean()
    const exchange: keyof ExchangeTokens = inst?.exchange === 'BSE' ? 'BSE' : 'NSE'
    const grouped: ExchangeTokens = { [exchange]: [token] }

    await getValidSession()
    let snaps
    try {
      snaps = await getQuotes(grouped, 'LTP')
    } catch (err) {
      if (err instanceof AuthError) {
        await invalidateSession()
        await getValidSession()
        snaps = await getQuotes(grouped, 'LTP')
      } else {
        throw err
      }
    }
    const ltp = snaps.find((s) => s.token === token)?.ltp
    return typeof ltp === 'number' && Number.isFinite(ltp) ? ltp : null
  } catch {
    // Rate limited / network / session issues: caller falls back to snapshot.
    return null
  }
}
