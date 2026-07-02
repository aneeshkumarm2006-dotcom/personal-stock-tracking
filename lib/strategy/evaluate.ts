import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import { tradingDaysBetween } from '@/lib/time/marketHours'

export type StrategyEventType =
  | 'entry_hit'
  | 'tp1_hit'
  | 'tp1_partial'
  | 'tp_hit'
  | 'sl_hit'
  | 'trail_hit'
  | 'closed_manual'
  | 'expired'

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
  // Never filled: a pending entry that didn't trigger within EXPIRY_TRADING_DAYS.
  | 'expired'

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
  'expired',
] as const

// A pending entry that never fills is aged out after this many trading days and
// marked 'expired': it stays on record (no position was ever taken) and its
// reserved capital is freed. Trading days are NSE weekdays — see
// tradingDaysBetween for the (holiday-agnostic) definition.
export const EXPIRY_TRADING_DAYS = 10

// Whether a still-pending entry has sat un-triggered long enough to expire.
export function pendingHasExpired(
  createdAt: Date,
  now: Date,
  limit: number = EXPIRY_TRADING_DAYS,
): boolean {
  return tradingDaysBetween(createdAt, now) >= limit
}

// How a pending long entry arms its fill:
//   - 'limit' (buy the dip): fills when price falls to or through the entry.
//   - 'stop'  (breakout):    fills when price rises to or through the entry.
// 'auto' is a request-time value only — the API resolves it to one of the two
// concrete types (off the reference price) before persisting.
export type TriggerType = 'limit' | 'stop'
export type RequestedTriggerType = TriggerType | 'auto'

export interface EvaluatableEntry {
  // Present on real Mongoose docs; used to identify the entry when an exit is
  // turned into a notification. Absent on synthetic/legacy rows.
  _id?: unknown
  groupId?: unknown
  instrumentToken: string
  instrumentSymbol?: string
  // Whether this entry is a real, held portfolio position — the gate that
  // decides if an SL/TP exit fires a loud alert.
  enteredToPortfolio?: boolean
  entryPrice: number
  stopLoss: number
  targetPrice: number
  target2?: number | null
  quantity: number
  soldQuantity?: number
  peakPrice?: number | null
  direction?: 'long'
  triggerType?: TriggerType
  status: StrategyEntryStatus
  // When the entry was created; drives expiry of un-triggered pending entries.
  // Supplied by Mongoose's timestamps. Absent only in synthetic/legacy rows, in
  // which case the entry simply never auto-expires.
  createdAt?: Date
  events: StrategyEvent[]
  save: () => Promise<unknown>
}

// Whether a pending entry's fill condition is met at the given price. A 'stop'
// (breakout) entry fills on the way up; a 'limit' (dip) entry fills on the way
// down. Missing triggerType is treated as 'limit' for backward compatibility.
export function entryTriggered(
  triggerType: TriggerType | undefined,
  entryPrice: number,
  ltp: number,
): boolean {
  return triggerType === 'stop' ? ltp >= entryPrice : ltp <= entryPrice
}

// Resolve a requested trigger type into a concrete one. An explicit choice is
// honoured as-is; 'auto' (or absent) is decided off the reference price — an
// entry at or above the current price is a breakout ('stop'), otherwise a dip
// buy ('limit'). With no reference price available it falls back to 'limit',
// matching the original behaviour.
export function resolveTriggerType(
  requested: RequestedTriggerType | undefined,
  entryPrice: number,
  referencePrice: number | null | undefined,
): TriggerType {
  if (requested === 'limit' || requested === 'stop') return requested
  if (referencePrice != null && Number.isFinite(referencePrice)) {
    return entryPrice >= referencePrice ? 'stop' : 'limit'
  }
  return 'limit'
}

export type ExitMode = 'trail' | 'scale' | 'single'

// An action-required exit an entry made THIS cycle — the trigger for a
// notification/email/push. Only exits that mean "go sell" are recorded (SL, a
// full TP, a scale-out half at TP1, a trailing-stop exit); informational
// transitions (fill, TP1-start-trailing, expiry) are not.
export type StrategyExitKind = 'sl_hit' | 'tp_hit' | 'trail_hit' | 'tp1_partial'

export type StrategyExit = {
  entryId: string
  groupId: string
  instrumentToken: string
  instrumentSymbol: string
  kind: StrategyExitKind
  // The live price at the crossing and the number of shares to act on now.
  price: number
  quantity: number
  // Gate: only entries backed by a real portfolio position raise a loud alert.
  enteredToPortfolio: boolean
  at: Date
}

export type EvaluationOutcome = {
  evaluated: number
  transitioned: number
  // Action-required exits made this cycle (see StrategyExit). Additive: existing
  // callers that only read evaluated/transitioned are unaffected.
  exits: StrategyExit[]
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
  const exits: StrategyExit[] = []

  const recordExit = (
    entry: EvaluatableEntry,
    kind: StrategyExitKind,
    price: number,
    quantity: number,
  ) => {
    exits.push({
      entryId: entry._id != null ? String(entry._id) : '',
      groupId: entry.groupId != null ? String(entry.groupId) : '',
      instrumentToken: entry.instrumentToken,
      instrumentSymbol: entry.instrumentSymbol ?? '',
      kind,
      price,
      quantity,
      enteredToPortfolio: entry.enteredToPortfolio ?? false,
      at: now,
    })
  }

  for (const entry of entries) {
    if (!OPEN.has(entry.status)) continue
    const ltp = ltpByToken.get(entry.instrumentToken)
    if (ltp === undefined) continue
    evaluated += 1

    // A failed save must not abort evaluation of the remaining entries; the
    // unsaved transition is retried on the next refresh cycle.
    try {
      if (entry.status === 'pending') {
        if (entryTriggered(entry.triggerType, entry.entryPrice, ltp)) {
          entry.status = 'active'
          entry.events.push({ type: 'entry_hit', price: ltp, timestamp: now })
          await entry.save()
          transitioned += 1
          continue
        }

        // Age out an entry that never filled. Once it has sat un-triggered for
        // EXPIRY_TRADING_DAYS it is marked 'expired' — kept on record (the ltp
        // is logged for context) and its reserved capital is freed. The thesis
        // behind the entry has gone stale; it should stop holding allocation.
        if (entry.createdAt && pendingHasExpired(entry.createdAt, now)) {
          entry.status = 'expired'
          entry.events.push({ type: 'expired', price: ltp, timestamp: now })
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
            recordExit(entry, 'tp_hit', ltp, entry.quantity)
          } else if (mode === 'trail') {
            // Single share: don't sell — start trailing the stop from here. No
            // exit to notify: nothing needs to be sold at TP1.
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
            recordExit(entry, 'tp1_partial', ltp, sold)
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
          recordExit(entry, 'sl_hit', ltp, entry.quantity)
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
          recordExit(entry, 'tp_hit', ltp, entry.quantity)
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
          recordExit(entry, 'trail_hit', ltp, entry.quantity)
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
          recordExit(entry, 'tp_hit', ltp, remaining)
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
          recordExit(entry, 'trail_hit', ltp, remaining)
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

  return { evaluated, transitioned, exits }
}
