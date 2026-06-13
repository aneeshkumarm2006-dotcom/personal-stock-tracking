import type { PriceSnapshotData } from '@/lib/angelone/quotes'

export type StrategyEventType =
  | 'entry_hit'
  | 'tp1_hit'
  | 'tp1_partial'
  | 'tp_hit'
  | 'sl_hit'
  | 'trail_hit'
  | 'closed_manual'

export type StrategyEvent = {
  type: StrategyEventType
  price: number
  // Present when the event is a (partial) exit; absent for informational
  // events (entry_hit, tp1_hit).
  quantity?: number
  timestamp: Date
}

export type StrategyEntryStatus =
  | 'pending'
  | 'active'
  | 'partial'
  | 'trailing'
  | 'tp_hit'
  | 'sl_hit'
  | 'trail_hit'
  | 'closed_manual'

// Statuses an entry can still move out of — these are re-evaluated each cycle.
export const OPEN_ENTRY_STATUSES = [
  'pending',
  'active',
  'partial',
  'trailing',
] as const

// Statuses that are settled and never change again.
export const TERMINAL_ENTRY_STATUSES = [
  'tp_hit',
  'sl_hit',
  'trail_hit',
  'closed_manual',
] as const

export interface EvaluatableEntry {
  instrumentToken: string
  entryPrice: number
  stopLoss: number
  targetPrice: number
  target2?: number | null
  quantity: number
  soldQuantity?: number
  peakPrice?: number | null
  direction?: 'long'
  status: StrategyEntryStatus
  events: StrategyEvent[]
  save: () => Promise<unknown>
}

export type ExitMode = 'trail' | 'scale' | 'single'

export type EvaluationOutcome = {
  evaluated: number
  transitioned: number
}

// Which exit playbook an entry follows, decided automatically by quantity:
//   - 1 share          -> hold past TP1 on a trailing stop ('trail')
//   - 2+ shares + TP2  -> scale out 50% at TP1, rest at TP2 ('scale')
//   - otherwise        -> full exit at TP1 ('single')
export function exitMode(entry: {
  quantity: number
  target2?: number | null
}): ExitMode {
  if (entry.quantity === 1) return 'trail'
  if (entry.quantity >= 2 && entry.target2 != null) return 'scale'
  return 'single'
}

// The live protective stop for an entry given its current state. Once TP1 is
// banked — whether the whole lot is trailing (single share) or only the
// scaled-out remainder is left (multi-share) — the stop ratchets up with the
// high-water mark but never below breakeven. Before TP1 it is the original SL.
export function currentStop(entry: {
  entryPrice: number
  stopLoss: number
  status: StrategyEntryStatus
  peakPrice?: number | null
}): number {
  if (entry.status === 'trailing' || entry.status === 'partial') {
    const risk = entry.entryPrice - entry.stopLoss
    const peak = entry.peakPrice ?? entry.entryPrice
    return Math.max(entry.entryPrice, peak - risk)
  }
  return entry.stopLoss
}

// Realized P&L from the exit events recorded on an entry (each carries the
// shares and price of that fill). Informational events have no quantity and
// contribute nothing.
export function realizedPnL(
  entryPrice: number,
  events: Pick<StrategyEvent, 'price' | 'quantity'>[],
): number {
  let pnl = 0
  for (const ev of events) {
    if (typeof ev.quantity === 'number' && ev.quantity > 0) {
      pnl += (ev.price - entryPrice) * ev.quantity
    }
  }
  return Math.round(pnl * 100) / 100
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

const OPEN = new Set<StrategyEntryStatus>(OPEN_ENTRY_STATUSES)

export async function evaluateEntries(
  entries: EvaluatableEntry[],
  snapshots: PriceSnapshotData[],
  now: Date = new Date(),
): Promise<EvaluationOutcome> {
  const ltpByToken = indexSnapshots(snapshots)
  let evaluated = 0
  let transitioned = 0

  for (const entry of entries) {
    if (!OPEN.has(entry.status)) continue
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

      if (entry.status === 'active') {
        // TP1 takes precedence over SL when both could trigger in one tick.
        if (ltp >= entry.targetPrice) {
          const mode = exitMode(entry)
          if (mode === 'single') {
            // No second target / indivisible-into-halves: book the whole lot.
            entry.soldQuantity = entry.quantity
            entry.status = 'tp_hit'
            entry.events.push({
              type: 'tp_hit',
              price: ltp,
              quantity: entry.quantity,
              timestamp: now,
            })
          } else if (mode === 'trail') {
            // Single share: don't sell — start trailing the stop from here.
            entry.peakPrice = ltp
            entry.status = 'trailing'
            entry.events.push({ type: 'tp1_hit', price: ltp, timestamp: now })
          } else {
            // Scale out: sell half now, then trail the rest (TP2 caps it).
            const sold = Math.floor(entry.quantity / 2)
            entry.soldQuantity = sold
            entry.peakPrice = ltp
            entry.status = 'partial'
            entry.events.push({
              type: 'tp1_partial',
              price: ltp,
              quantity: sold,
              timestamp: now,
            })
          }
          await entry.save()
          transitioned += 1
          continue
        }

        if (ltp <= entry.stopLoss) {
          entry.soldQuantity = entry.quantity
          entry.status = 'sl_hit'
          entry.events.push({
            type: 'sl_hit',
            price: ltp,
            quantity: entry.quantity,
            timestamp: now,
          })
          await entry.save()
          transitioned += 1
        }
        continue
      }

      if (entry.status === 'trailing') {
        let peakAdvanced = false
        if (entry.peakPrice == null || ltp > entry.peakPrice) {
          entry.peakPrice = ltp
          peakAdvanced = true
        }

        // Hard exit at TP2 when one was given.
        if (entry.target2 != null && ltp >= entry.target2) {
          entry.soldQuantity = entry.quantity
          entry.status = 'tp_hit'
          entry.events.push({
            type: 'tp_hit',
            price: ltp,
            quantity: entry.quantity,
            timestamp: now,
          })
          await entry.save()
          transitioned += 1
          continue
        }

        const stop = currentStop(entry)
        if (ltp <= stop) {
          entry.soldQuantity = entry.quantity
          entry.status = 'trail_hit'
          entry.events.push({
            type: 'trail_hit',
            price: ltp,
            quantity: entry.quantity,
            timestamp: now,
          })
          await entry.save()
          transitioned += 1
          continue
        }

        // No exit, but persist a new high so the trail survives restarts.
        if (peakAdvanced) await entry.save()
        continue
      }

      if (entry.status === 'partial') {
        // The remainder behaves exactly like a single-share trail: drag the
        // stop up behind new highs, never below breakeven, with TP2 as a cap.
        const remaining = entry.quantity - (entry.soldQuantity ?? 0)
        let peakAdvanced = false
        if (entry.peakPrice == null || ltp > entry.peakPrice) {
          entry.peakPrice = ltp
          peakAdvanced = true
        }

        // Hard exit at TP2 when one was given.
        if (entry.target2 != null && ltp >= entry.target2) {
          entry.soldQuantity = entry.quantity
          entry.status = 'tp_hit'
          entry.events.push({
            type: 'tp_hit',
            price: ltp,
            quantity: remaining,
            timestamp: now,
          })
          await entry.save()
          transitioned += 1
          continue
        }

        const stop = currentStop(entry)
        if (ltp <= stop) {
          entry.soldQuantity = entry.quantity
          entry.status = 'trail_hit'
          entry.events.push({
            type: 'trail_hit',
            price: ltp,
            quantity: remaining,
            timestamp: now,
          })
          await entry.save()
          transitioned += 1
          continue
        }

        // No exit, but persist a new high so the trail survives restarts.
        if (peakAdvanced) await entry.save()
        continue
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
