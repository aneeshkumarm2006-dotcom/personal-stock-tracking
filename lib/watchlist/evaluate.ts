import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import type { IndicatorSnapshotData } from '@/lib/indicators/types'
import { evaluateCondition } from '@/lib/alerts/conditions'
import type {
  AlertConfig,
  AlertDirection,
  AlertStatus,
  ConditionType,
} from '@/lib/alerts/types'

// The minimal shape the evaluator needs from a hydrated WatchlistItem. The
// runtime objects are Mongoose documents (their property setters track changes
// for save()); we declare an explicit interface and cast, exactly as
// strategy/evaluate.ts does with EvaluatableEntry.
//
// `type` is optional so alerts stored before the condition types existed evaluate
// as 'price' (see conditions.ts). `targetPrice`/`direction` are only meaningful
// for the `price` type; the rest carry parameters in `config`.
export interface AlertForEval {
  _id: unknown
  type?: ConditionType
  targetPrice?: number
  direction?: AlertDirection
  config?: AlertConfig
  status: AlertStatus
  lastTriggeredAt?: Date
  lastTriggeredPrice?: number
  note?: string
}

export interface WatchlistItemForEval {
  instrumentToken: string
  instrumentSymbol?: string
  exchange?: string
  alerts: AlertForEval[]
  save: () => Promise<unknown>
}

// Which feature owns the alert — used by the mailer to link back to the right
// page ('watchlist' tab vs the portfolio stock page).
export type AlertSource = 'watchlist' | 'portfolio'

// A fired alert, returned for the caller to email. Self-contained so the
// evaluator stays pure (no email/IO of its own). Carries the condition `type`,
// its `config`, and the `triggerValue` (the figure that decided it) so the
// notification/email can phrase any condition generically via describeCondition.
export type TriggeredAlert = {
  instrumentToken: string
  instrumentSymbol: string
  exchange: string
  alertId: string
  type: ConditionType
  direction?: AlertDirection
  targetPrice?: number
  config?: AlertConfig
  triggerValue: number | null
  ltp: number
  dayChangePct: number | null
  note: string
  triggeredAt: Date
  source: AlertSource
}

function indexSnapshots(
  snapshots: PriceSnapshotData[],
): Map<string, PriceSnapshotData> {
  const map = new Map<string, PriceSnapshotData>()
  for (const s of snapshots) {
    if (typeof s.ltp === 'number' && Number.isFinite(s.ltp)) {
      map.set(s.token, s)
    }
  }
  return map
}

// Evaluate every item's armed alerts against the freshest snapshot batch. On a
// crossing, transition the alert armed -> triggered (fire-once), stamp the
// trigger, and persist. Only alerts whose save SUCCEEDS are returned, so the
// caller never emails an unpersisted transition. Mirrors evaluateEntries: a
// failed save logs and is retried next cycle without aborting the loop.
//
// `indicators` supplies the per-token IndicatorSnapshot needed by indicator-
// derived condition types (SMA/EMA/RSI/MACD/rating/volume). It defaults to an
// empty map, so quote-derived conditions (price/pct_change/week52/circuit) fire
// with no indicator data and indicator-derived ones simply skip when absent.
export async function evaluateWatchlistAlerts(
  items: WatchlistItemForEval[],
  snapshots: PriceSnapshotData[],
  now: Date = new Date(),
  source: AlertSource = 'watchlist',
  indicators: Map<string, IndicatorSnapshotData> = new Map(),
): Promise<TriggeredAlert[]> {
  const snapByToken = indexSnapshots(snapshots)
  const triggered: TriggeredAlert[] = []

  for (const item of items) {
    const snap = snapByToken.get(item.instrumentToken)
    if (!snap || typeof snap.ltp !== 'number') continue
    const ltp = snap.ltp
    const ind = indicators.get(item.instrumentToken)

    let mutated = false
    const itemTriggers: TriggeredAlert[] = []

    for (const alert of item.alerts) {
      if (alert.status !== 'armed') continue // snoozed / disabled / triggered skip
      const result = evaluateCondition(alert, snap, ind)
      if (!result.hit) continue

      alert.status = 'triggered'
      alert.lastTriggeredAt = now
      alert.lastTriggeredPrice = ltp
      mutated = true

      itemTriggers.push({
        instrumentToken: item.instrumentToken,
        instrumentSymbol: item.instrumentSymbol ?? item.instrumentToken,
        exchange: item.exchange ?? 'NSE',
        alertId: String(alert._id),
        type: alert.type ?? 'price',
        direction: alert.direction,
        targetPrice: alert.targetPrice,
        config: alert.config,
        triggerValue: result.value,
        ltp,
        dayChangePct:
          typeof snap.pctChange === 'number' ? snap.pctChange : null,
        note: alert.note ?? '',
        triggeredAt: now,
        source,
      })
    }

    if (mutated) {
      try {
        await item.save()
        triggered.push(...itemTriggers)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.log(
          JSON.stringify({
            event: 'watchlist.evaluate',
            status: 'error',
            token: item.instrumentToken,
            message,
          }),
        )
        // Do not email unpersisted transitions; they retry next cycle.
      }
    }
  }

  return triggered
}
