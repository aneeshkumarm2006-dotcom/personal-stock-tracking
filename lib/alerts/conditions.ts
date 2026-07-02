import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import type { IndicatorSnapshotData } from '@/lib/indicators/types'
import type {
  AlertConfig,
  AlertDirection,
  ConditionType,
} from '@/lib/alerts/types'

// The minimal alert shape the dispatcher reads. `type` may be absent on
// pre-existing (legacy) alerts — treated as 'price'.
export type EvaluableAlert = {
  type?: ConditionType
  targetPrice?: number
  direction?: AlertDirection
  config?: AlertConfig
}

// The outcome of testing one condition against the freshest data. `value` is the
// figure that decided it (ltp, %change, volume, rsi, …) for the notification.
export type ConditionResult = { hit: boolean; value: number | null }

const MISS: ConditionResult = { hit: false, value: null }

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

// Pure dispatcher: given an alert, the live snapshot, and (for indicator-derived
// types) the token's precomputed IndicatorSnapshot, decide whether it fires.
// Indicator-derived conditions with no indicator data return a miss (never fire)
// — mirroring the evaluator's "no snapshot → skip" contract. Adding a new
// condition type is a new `case` here plus a describe.ts phrase.
export function evaluateCondition(
  alert: EvaluableAlert,
  snap: PriceSnapshotData,
  ind?: IndicatorSnapshotData,
): ConditionResult {
  const type = alert.type ?? 'price'
  const cfg = alert.config ?? {}
  const ltp = snap.ltp

  switch (type) {
    case 'price': {
      if (!isNum(ltp) || !isNum(alert.targetPrice)) return MISS
      const hit =
        alert.direction === 'above'
          ? ltp >= alert.targetPrice
          : ltp <= alert.targetPrice
      return { hit, value: ltp }
    }

    case 'pct_change': {
      const pct = snap.pctChange
      const thr = cfg.thresholdPct
      if (!isNum(pct) || !isNum(thr)) return MISS
      const hit = alert.direction === 'below' ? pct <= -thr : pct >= thr
      return { hit, value: pct }
    }

    case 'volume': {
      const vol = snap.tradeVolume
      const avg = ind?.avgVolume20d
      const multiple = cfg.multiple ?? 2
      if (!isNum(vol) || !isNum(avg) || avg <= 0) return MISS
      return { hit: vol >= multiple * avg, value: vol }
    }

    case 'week52': {
      if (!isNum(ltp) || (cfg.edge !== 'high' && cfg.edge !== 'low')) return MISS
      const margin = (cfg.marginPct ?? 0) / 100
      if (cfg.edge === 'high') {
        const hi = isNum(snap.week52High) ? snap.week52High : ind?.high52w
        if (!isNum(hi)) return MISS
        return { hit: ltp >= hi * (1 + margin), value: ltp }
      }
      const lo = isNum(snap.week52Low) ? snap.week52Low : ind?.low52w
      if (!isNum(lo)) return MISS
      return { hit: ltp <= lo * (1 - margin), value: ltp }
    }

    case 'circuit': {
      if (!isNum(ltp)) return MISS
      const band = cfg.band ?? 'either'
      const hitUpper = isNum(snap.upperCircuit) && ltp >= snap.upperCircuit
      const hitLower = isNum(snap.lowerCircuit) && ltp <= snap.lowerCircuit
      const hit =
        band === 'upper'
          ? hitUpper
          : band === 'lower'
            ? hitLower
            : hitUpper || hitLower
      return { hit, value: ltp }
    }

    case 'sma_cross':
    case 'ema_cross': {
      const period = cfg.period
      if (!isNum(ltp) || !ind || !isNum(period)) return MISS
      const line =
        type === 'sma_cross'
          ? ind.sma?.[String(period)]
          : ind.ema?.[String(period)]
      if (!isNum(line)) return MISS
      const hit = alert.direction === 'above' ? ltp >= line : ltp <= line
      return { hit, value: line }
    }

    case 'rsi': {
      const rsi = ind?.rsi14
      if (!isNum(rsi)) return MISS
      const band = cfg.rsiBand ?? 'overbought'
      const thr = cfg.threshold ?? (band === 'overbought' ? 70 : 30)
      const hit = band === 'overbought' ? rsi >= thr : rsi <= thr
      return { hit, value: rsi }
    }

    case 'macd_cross': {
      if (
        !ind ||
        !isNum(ind.macd) ||
        !isNum(ind.macdSignal) ||
        !isNum(ind.prevMacd) ||
        !isNum(ind.prevSignal)
      ) {
        return MISS
      }
      const crossedUp =
        ind.prevMacd <= ind.prevSignal && ind.macd > ind.macdSignal
      const crossedDown =
        ind.prevMacd >= ind.prevSignal && ind.macd < ind.macdSignal
      const hit = cfg.macdDirection === 'bearish' ? crossedDown : crossedUp
      return { hit, value: ind.macd - ind.macdSignal }
    }

    case 'rating_flip': {
      if (!ind) return MISS
      const tf = cfg.timeframe ?? '1D'
      const cur = ind.rating?.[tf]
      const prev = ind.prevRating?.[tf]
      if (!cur || !prev) return MISS
      const flipped = cur !== prev
      const to = cfg.to ?? 'any'
      const hit = flipped && (to === 'any' || cur === to)
      return { hit, value: null }
    }

    default:
      return MISS
  }
}
