import type { PriceSnapshotData } from '@/lib/angelone/quotes'

export type StrategyEvent = {
  type: 'entry_hit' | 'tp_hit' | 'sl_hit' | 'closed_manual'
  price: number
  timestamp: Date
}

export type StrategyEntryStatus =
  | 'pending'
  | 'active'
  | 'tp_hit'
  | 'sl_hit'
  | 'closed_manual'

export interface EvaluatableEntry {
  instrumentToken: string
  entryPrice: number
  stopLoss: number
  targetPrice: number
  direction?: 'long'
  status: StrategyEntryStatus
  events: StrategyEvent[]
  save: () => Promise<unknown>
}

export type EvaluationOutcome = {
  evaluated: number
  transitioned: number
}

function indexSnapshots(snapshots: PriceSnapshotData[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of snapshots) {
    if (typeof s.ltp === 'number' && Number.isFinite(s.ltp)) {
      map.set(s.token, s.ltp)
    }
  }
  return map
}

export async function evaluateEntries(
  entries: EvaluatableEntry[],
  snapshots: PriceSnapshotData[],
  now: Date = new Date(),
): Promise<EvaluationOutcome> {
  const ltpByToken = indexSnapshots(snapshots)
  let evaluated = 0
  let transitioned = 0

  for (const entry of entries) {
    if (entry.status !== 'pending' && entry.status !== 'active') continue
    const ltp = ltpByToken.get(entry.instrumentToken)
    if (ltp === undefined) continue
    evaluated += 1

    // A failed save must not abort evaluation of the remaining entries; the
    // unsaved transition is retried on the next refresh cycle.
    try {
      if (entry.status === 'pending') {
        if (ltp <= entry.entryPrice) {
          entry.status = 'active'
          entry.events.push({ type: 'entry_hit', price: ltp, timestamp: now })
          await entry.save()
          transitioned += 1
        }
        continue
      }

      // active — TP takes precedence over SL when both could trigger
      if (ltp >= entry.targetPrice) {
        entry.status = 'tp_hit'
        entry.events.push({ type: 'tp_hit', price: ltp, timestamp: now })
        await entry.save()
        transitioned += 1
        continue
      }

      if (ltp <= entry.stopLoss) {
        entry.status = 'sl_hit'
        entry.events.push({ type: 'sl_hit', price: ltp, timestamp: now })
        await entry.save()
        transitioned += 1
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(
        JSON.stringify({
          event: 'strategy.evaluate',
          status: 'error',
          token: entry.instrumentToken,
          message,
        }),
      )
    }
  }

  return { evaluated, transitioned }
}
