import { getCandles, type CandleData, type CandleInterval } from './historical'
import { AuthError, RateLimitError } from './errors'

// Angel One's historical (candle) endpoint throttles bursts far more tightly than
// the quote endpoint — sustained calls need ~1.5s spacing, and an over-eager one
// comes back as an HTTP 403 that classifyAngelError surfaces as AuthError. These
// constants mirror the quote path's candle-fallback guardrails (lib/angelone/
// quotes.ts) so both throttle-safe fan-outs stay in step.
export const CANDLE_SPACING_MS = 1500
export const CANDLE_BACKOFF_MS = 1500
// Hard wall-clock cap on a whole batch so a pathological run (many uncached
// tokens all throttling) can't stall indefinitely.
export const CANDLE_BATCH_BUDGET_MS = 8000
// A single batch should never fan out into an unbounded burst of candle calls.
export const MAX_CANDLE_BATCH = 25

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// One instrument's candle fetch with a single throttle-aware retry. A 403
// (AuthError) here is the historical endpoint throttling us, not a dead session —
// back off once and retry before giving up. Returns [] on failure so a batch
// never aborts on one bad token.
export async function fetchCandlesWithBackoff(
  token: string,
  exchange: 'NSE' | 'BSE',
  interval: CandleInterval,
  from: Date,
  to: Date,
): Promise<CandleData[]> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await getCandles(token, exchange, interval, from, to)
    } catch (err) {
      const throttled = err instanceof RateLimitError || err instanceof AuthError
      if (throttled && attempt === 1) {
        await sleep(CANDLE_BACKOFF_MS)
        continue
      }
      console.log(
        JSON.stringify({
          event: 'angelone.candleBatch',
          status: 'error',
          token,
          throttled,
          message: err instanceof Error ? err.message : String(err),
        }),
      )
      return []
    }
  }
  return []
}
