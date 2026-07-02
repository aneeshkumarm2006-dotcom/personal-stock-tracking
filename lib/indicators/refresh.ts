import { IndicatorSnapshot } from '@/lib/db/models/IndicatorSnapshot'
import { isCandleFresh } from '@/lib/angelone/historical'
import {
  CANDLE_BATCH_BUDGET_MS,
  CANDLE_SPACING_MS,
  MAX_CANDLE_BATCH,
  fetchCandlesWithBackoff,
  sleep,
} from '@/lib/angelone/candleThrottle'
import { computeIndicators } from '@/lib/indicators/compute'
import type { IndicatorSnapshotData } from '@/lib/indicators/types'

export type IndicatorPair = { token: string; exchange: 'NSE' | 'BSE' }

const DAY_MS = 24 * 60 * 60 * 1000
// ~5 years of daily candles — enough for SMA200 and the weekly/monthly rating
// resample, in one request (ONE_DAY caps at 2000 days). Matches the research page.
const LOOKBACK_DAYS = 1825
// Indicator levels only change on a daily close, so a snapshot recomputed within
// this window is reused as-is. Bounds candle fetches to a couple per token per day
// even though the refresh cycle runs every minute.
const STALE_MS = 6 * 60 * 60 * 1000

type LeanIndicatorDoc = {
  token: string
  exchange?: string
  computedAt?: Date
  asOfCandle?: Date | null
  sma?: Record<string, number>
  ema?: Record<string, number>
  rsi14?: number | null
  macd?: number | null
  macdSignal?: number | null
  prevMacd?: number | null
  prevSignal?: number | null
  rating?: IndicatorSnapshotData['rating']
  prevRating?: IndicatorSnapshotData['prevRating']
  high52w?: number | null
  low52w?: number | null
  avgVolume20d?: number | null
}

function docToData(d: LeanIndicatorDoc): IndicatorSnapshotData {
  return {
    token: d.token,
    exchange: d.exchange,
    asOfCandle: d.asOfCandle ? new Date(d.asOfCandle).toISOString() : null,
    sma: d.sma ?? {},
    ema: d.ema ?? {},
    rsi14: d.rsi14 ?? null,
    macd: d.macd ?? null,
    macdSignal: d.macdSignal ?? null,
    prevMacd: d.prevMacd ?? null,
    prevSignal: d.prevSignal ?? null,
    rating: d.rating ?? {},
    prevRating: d.prevRating ?? {},
    high52w: d.high52w ?? null,
    low52w: d.low52w ?? null,
    avgVolume20d: d.avgVolume20d ?? null,
  }
}

// Ensure a fresh IndicatorSnapshot exists for each token that has an armed
// indicator-derived alert, and return them keyed by token for the evaluator.
// Fresh snapshots (recomputed within STALE_MS) are reused with no candle call;
// stale/missing ones fetch ~5y of daily candles once, throttle-safely (shared
// guardrails with the quote candle-fallback). A token whose candle fetch fails
// still surfaces its previous (stale) snapshot so evaluation degrades gracefully.
export async function refreshIndicatorSnapshots(
  pairs: IndicatorPair[],
): Promise<Map<string, IndicatorSnapshotData>> {
  const result = new Map<string, IndicatorSnapshotData>()
  if (pairs.length === 0) return result

  const tokens = pairs.map((p) => p.token)
  const existingDocs = (await IndicatorSnapshot.find({
    token: { $in: tokens },
  }).lean()) as unknown as LeanIndicatorDoc[]
  const existing = new Map(existingDocs.map((d) => [d.token, d]))

  const nowMs = Date.now()
  const to = new Date(nowMs)
  const from = new Date(nowMs - LOOKBACK_DAYS * DAY_MS)

  const attempted = pairs.slice(0, MAX_CANDLE_BATCH)
  if (pairs.length > attempted.length) {
    console.log(
      JSON.stringify({
        event: 'indicators.refresh',
        status: 'batch-capped',
        wanted: pairs.length,
        attempted: attempted.length,
      }),
    )
  }

  const startedAt = Date.now()
  let networkCallMade = false

  for (const { token, exchange } of attempted) {
    const ex = existing.get(token)
    const fresh =
      ex?.computedAt && nowMs - new Date(ex.computedAt).getTime() < STALE_MS
    if (fresh) {
      result.set(token, docToData(ex))
      continue
    }

    const willHitNetwork = !isCandleFresh(token, exchange, 'ONE_DAY', from, to)
    if (willHitNetwork && Date.now() - startedAt > CANDLE_BATCH_BUDGET_MS) {
      // Out of time budget: fall back to the stale snapshot if we have one.
      if (ex) result.set(token, docToData(ex))
      continue
    }
    if (willHitNetwork && networkCallMade) await sleep(CANDLE_SPACING_MS)

    const candles = await fetchCandlesWithBackoff(
      token,
      exchange,
      'ONE_DAY',
      from,
      to,
    )
    if (willHitNetwork) networkCallMade = true

    if (candles.length === 0) {
      if (ex) result.set(token, docToData(ex))
      continue
    }

    const data = computeIndicators(token, exchange, candles)
    result.set(token, data)
    try {
      await IndicatorSnapshot.updateOne(
        { token },
        {
          $set: {
            ...data,
            computedAt: new Date(nowMs),
            asOfCandle: data.asOfCandle ? new Date(data.asOfCandle) : null,
          },
        },
        { upsert: true },
      )
    } catch (err) {
      console.log(
        JSON.stringify({
          event: 'indicators.refresh',
          status: 'persist-error',
          token,
          message: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  // Tokens beyond the per-cycle cap still surface any existing snapshot so their
  // alerts keep evaluating (against slightly older levels) until a later cycle
  // refreshes them.
  for (const { token } of pairs.slice(MAX_CANDLE_BATCH)) {
    const ex = existing.get(token)
    if (ex && !result.has(token)) result.set(token, docToData(ex))
  }

  return result
}
