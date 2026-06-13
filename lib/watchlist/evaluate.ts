import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import type { AlertDirection, AlertStatus } from '@/lib/watchlist/types'

// The minimal shape the evaluator needs from a hydrated WatchlistItem. The
// runtime objects are Mongoose documents (their property setters track changes
// for save()); we declare an explicit interface and cast, exactly as
// strategy/evaluate.ts does with EvaluatableEntry.
export interface AlertForEval {
  _id: unknown
  targetPrice: number
  direction: AlertDirection
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

// A fired alert, returned for the caller to email. Self-contained so the
// evaluator stays pure (no email/IO of its own).
export type TriggeredAlert = {
  instrumentToken: string
  instrumentSymbol: string
  exchange: string
  alertId: string
  direction: AlertDirection
  targetPrice: number
  ltp: number
  dayChangePct: number | null
  note: string
  triggeredAt: Date
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
export async function evaluateWatchlistAlerts(
  items: WatchlistItemForEval[],
  snapshots: PriceSnapshotData[],
  now: Date = new Date(),
): Promise<TriggeredAlert[]> {
  const snapByToken = indexSnapshots(snapshots)
  const triggered: TriggeredAlert[] = []

  for (const item of items) {
    const snap = snapByToken.get(item.instrumentToken)
    if (!snap || typeof snap.ltp !== 'number') continue
    const ltp = snap.ltp

    let mutated = false
    const itemTriggers: TriggeredAlert[] = []

    for (const alert of item.alerts) {
      if (alert.status !== 'armed') continue // snoozed / disabled / triggered skip
      const hit =
        alert.direction === 'below'
          ? ltp <= alert.targetPrice
          : ltp >= alert.targetPrice
      if (!hit) continue

      alert.status = 'triggered'
      alert.lastTriggeredAt = now
      alert.lastTriggeredPrice = ltp
      mutated = true

      itemTriggers.push({
        instrumentToken: item.instrumentToken,
        instrumentSymbol: item.instrumentSymbol ?? item.instrumentToken,
        exchange: item.exchange ?? 'NSE',
        alertId: String(alert._id),
        direction: alert.direction,
        targetPrice: alert.targetPrice,
        ltp,
        dayChangePct:
          typeof snap.pctChange === 'number' ? snap.pctChange : null,
        note: alert.note ?? '',
        triggeredAt: now,
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
