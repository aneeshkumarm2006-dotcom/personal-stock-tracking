import { Notification, type NotificationDoc } from '@/lib/db/models/Notification'
import type { StrategyExit, StrategyExitKind } from '@/lib/strategy/evaluate'
import type { TriggeredAlert } from '@/lib/watchlist/evaluate'
import { conditionLabel, describeCondition } from '@/lib/alerts/describe'
import { formatCurrency } from '@/lib/format'

type Severity = 'danger' | 'success' | 'warning'

const SEVERITY: Record<StrategyExitKind, Severity> = {
  sl_hit: 'danger',
  tp_hit: 'success',
  trail_hit: 'success',
  tp1_partial: 'warning',
}

// The human-facing headline + one-liner for each exit. Phrased as an
// instruction ("Sell N …") because the whole point is that the user has to go
// execute the trade.
function compose(ex: StrategyExit): { title: string; body: string } {
  const symbol = ex.instrumentSymbol || ex.instrumentToken
  const price = formatCurrency(ex.price)
  const qty = ex.quantity
  switch (ex.kind) {
    case 'sl_hit':
      return {
        title: `${symbol} — Stop loss hit`,
        body: `Sell ${qty} @ ${price} now — stop loss triggered.`,
      }
    case 'tp_hit':
      return {
        title: `${symbol} — Target hit`,
        body: `Sell ${qty} @ ${price} now — target reached.`,
      }
    case 'trail_hit':
      return {
        title: `${symbol} — Trailing stop hit`,
        body: `Sell ${qty} @ ${price} now — trailing stop triggered.`,
      }
    case 'tp1_partial':
      return {
        title: `${symbol} — TP1 hit (sell half)`,
        body: `Sell ${qty} @ ${price} now — first target reached; trail the rest.`,
      }
  }
}

// Create the durable notification for one exit. Returns the created doc, or null
// when it already exists (E11000 on the unique {strategyEntryId, kind} index) so
// the caller skips the email/push side effects for a duplicate. Any other error
// propagates to the caller's guarded try/catch.
export async function createExitNotification(
  ex: StrategyExit,
): Promise<NotificationDoc | null> {
  const { title, body } = compose(ex)
  try {
    const doc = await Notification.create({
      source: 'strategy',
      kind: ex.kind,
      severity: SEVERITY[ex.kind],
      strategyEntryId: ex.entryId,
      groupId: ex.groupId || undefined,
      instrumentToken: ex.instrumentToken,
      instrumentSymbol: ex.instrumentSymbol,
      title,
      body,
      price: ex.price,
      quantity: ex.quantity,
      // At-most-one per (entry, exit kind) — a scale-out fires tp1_partial then
      // tp_hit (different kinds, both allowed); a re-run of the same exit collides.
      dedupeKey: `strategy:${String(ex.entryId)}:${ex.kind}`,
    })
    return doc
  } catch (err) {
    if ((err as { code?: number } | null)?.code === 11000) return null
    throw err
  }
}

// The headline + one-liner for a user-armed alert (watchlist or a portfolio
// holding), for any condition type. Informational, not an execute-now
// instruction, so it reads as a heads-up rather than a "Sell N …" order. The
// standing rule comes from the shared describeCondition, so any condition type is
// phrased consistently across banner, email, and the alert list.
function composeAlert(alert: TriggeredAlert): { title: string; body: string } {
  const symbol = alert.instrumentSymbol || alert.instrumentToken
  const now = formatCurrency(alert.ltp)
  const rule = describeCondition(alert)
  return {
    title: `${symbol} — ${conditionLabel(alert)}`,
    body: `Now ${now} — condition met: ${rule}.`,
  }
}

// Legacy price alerts keep their price_below/price_above kind (so old banner
// filters and the closed-enum history still resolve); every other condition uses
// the generic 'alert' kind and carries specifics in conditionType + the body.
function alertKind(
  alert: TriggeredAlert,
): 'price_above' | 'price_below' | 'alert' {
  if (alert.type === 'price') {
    return alert.direction === 'above' ? 'price_above' : 'price_below'
  }
  return 'alert'
}

// Create the durable notification for one triggered price alert. Same fire-once
// contract as createExitNotification: returns null on the unique-index collision
// (dedupeKey) so the caller skips the email/push side effects for a duplicate.
// The dedupeKey folds in triggeredAt so re-arming the same alert legitimately
// raises a fresh notification rather than being suppressed forever.
export async function createAlertNotification(
  alert: TriggeredAlert,
): Promise<NotificationDoc | null> {
  const { title, body } = composeAlert(alert)
  try {
    const doc = await Notification.create({
      source: alert.source,
      kind: alertKind(alert),
      conditionType: alert.type,
      severity: 'info',
      alertId: alert.alertId,
      instrumentToken: alert.instrumentToken,
      instrumentSymbol: alert.instrumentSymbol,
      title,
      body,
      price: alert.ltp,
      dedupeKey: `${alert.source}:${alert.alertId}:${alert.triggeredAt.toISOString()}`,
    })
    return doc
  } catch (err) {
    if ((err as { code?: number } | null)?.code === 11000) return null
    throw err
  }
}
