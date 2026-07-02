import { connectDB } from '@/lib/db/connect'
import { Instrument } from '@/lib/db/models/Instrument'
import { PriceSnapshot } from '@/lib/db/models/PriceSnapshot'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { Transaction } from '@/lib/db/models/Transaction'
import { WatchlistItem } from '@/lib/db/models/WatchlistItem'
import { HoldingAlerts } from '@/lib/db/models/HoldingAlert'
import { getQuotes, type ExchangeTokens, type PriceSnapshotData } from '@/lib/angelone/quotes'
import { AuthError, RateLimitError } from '@/lib/angelone/errors'
import { getValidSession, invalidateSession } from '@/lib/angelone/session'
import {
  evaluateEntries,
  OPEN_ENTRY_STATUSES,
  type EvaluatableEntry,
} from '@/lib/strategy/evaluate'
import {
  evaluateWatchlistAlerts,
  type WatchlistItemForEval,
} from '@/lib/watchlist/evaluate'
import { INDICATOR_ALERT_TYPES } from '@/lib/alerts/types'
import {
  refreshIndicatorSnapshots,
  type IndicatorPair,
} from '@/lib/indicators/refresh'
import type { IndicatorSnapshotData } from '@/lib/indicators/types'
import { sendStrategyExitEmail, sendWatchlistAlertEmail } from '@/lib/email/mailer'
import {
  createAlertNotification,
  createExitNotification,
} from '@/lib/notifications/create'
import { ensureNotificationIndexes } from '@/lib/db/models/Notification'
import {
  buildAlertPushPayload,
  buildExitPushPayload,
  sendPushToAll,
} from '@/lib/push/send'

export type RefreshSkipReason = 'no tokens' | 'rate_limited' | 'error'

export type RefreshResult =
  | {
      skipped: true
      reason: RefreshSkipReason
      message?: string
      durationMs: number
    }
  | {
      skipped: false
      fetched: number
      evaluated: number
      transitioned: number
      alertsTriggered: number
      // Loud SL/TP notifications raised for entered-into-portfolio positions.
      strategyAlerts: number
      durationMs: number
    }

export async function collectOpenHoldingTokens(): Promise<Set<string>> {
  const rows = await Transaction.aggregate<{ _id: string; netQty: number }>([
    {
      $group: {
        _id: '$instrumentToken',
        netQty: {
          $sum: {
            $cond: [{ $eq: ['$type', 'BUY'] }, '$quantity', { $multiply: ['$quantity', -1] }],
          },
        },
      },
    },
    { $match: { netQty: { $gt: 0 } } },
  ])
  return new Set(rows.map((r) => r._id))
}

export async function collectStrategyTokens(): Promise<Set<string>> {
  const docs = await StrategyEntry.find(
    { status: { $in: [...OPEN_ENTRY_STATUSES] } },
    { instrumentToken: 1, _id: 0 },
  ).lean()
  const set = new Set<string>()
  for (const d of docs) {
    if (d.instrumentToken) set.add(d.instrumentToken)
  }
  return set
}

// Every watchlist row is priced live so the open page reflects fresh quotes for
// all items, not just those with an armed alert. Alert *evaluation* still only
// touches armed alerts (see fetchAlertableWatchlistItems); this collector only
// widens which tokens get a fresh quote. The token count feeds the quote batch,
// which getQuotes chunks under Angel One's 50-per-request cap.
async function collectWatchlistTokens(): Promise<Set<string>> {
  const docs = await WatchlistItem.find(
    {},
    { instrumentToken: 1, _id: 0 },
  ).lean()
  const set = new Set<string>()
  for (const d of docs) {
    if (d.instrumentToken) set.add(d.instrumentToken)
  }
  return set
}

// Hydrated docs (need .save()) for the alert evaluator.
async function fetchAlertableWatchlistItems(): Promise<WatchlistItemForEval[]> {
  const docs = await WatchlistItem.find({ 'alerts.status': 'armed' })
  return docs as unknown as WatchlistItemForEval[]
}

// Portfolio holding alerts live on their own per-instrument docs. Same shape as
// watchlist items for the evaluator (token/symbol/exchange/alerts/save).
async function collectHoldingAlertTokens(): Promise<Set<string>> {
  const docs = await HoldingAlerts.find(
    { 'alerts.status': 'armed' },
    { instrumentToken: 1, _id: 0 },
  ).lean()
  const set = new Set<string>()
  for (const d of docs) {
    if (d.instrumentToken) set.add(d.instrumentToken)
  }
  return set
}

async function fetchAlertableHoldingAlerts(): Promise<WatchlistItemForEval[]> {
  const docs = await HoldingAlerts.find({ 'alerts.status': 'armed' })
  return docs as unknown as WatchlistItemForEval[]
}

// Tokens that have an armed indicator-derived alert (SMA/EMA/RSI/MACD/rating/
// volume) — the only tokens for which we spend a candle call to compute an
// IndicatorSnapshot. Watchlist alerts fire regardless of holding; holding alerts
// are held-gated exactly like the pricing/alert union above. Legacy alerts (no
// `type`) never match the Tier-B type filter, so they add no candle cost.
async function collectIndicatorAlertTokens(
  heldTokens: Set<string>,
): Promise<Set<string>> {
  const typeFilter = { $in: [...INDICATOR_ALERT_TYPES] }
  const [wl, ha] = await Promise.all([
    WatchlistItem.find(
      { 'alerts.status': 'armed', 'alerts.type': typeFilter },
      { instrumentToken: 1, _id: 0 },
    ).lean(),
    HoldingAlerts.find(
      { 'alerts.status': 'armed', 'alerts.type': typeFilter },
      { instrumentToken: 1, _id: 0 },
    ).lean(),
  ])
  const set = new Set<string>()
  for (const d of wl) if (d.instrumentToken) set.add(d.instrumentToken)
  for (const d of ha) {
    if (d.instrumentToken && heldTokens.has(d.instrumentToken)) {
      set.add(d.instrumentToken)
    }
  }
  return set
}

async function groupTokensByExchange(tokens: Set<string>): Promise<ExchangeTokens> {
  if (tokens.size === 0) return {}
  const instruments = await Instrument.find(
    { token: { $in: [...tokens] } },
    { token: 1, exchange: 1, _id: 0 },
  ).lean()

  const nse: string[] = []
  const bse: string[] = []
  for (const inst of instruments) {
    if (!inst.token) continue
    if (inst.exchange === 'BSE') bse.push(inst.token)
    else nse.push(inst.token)
  }
  const grouped: ExchangeTokens = {}
  if (nse.length) grouped.NSE = nse
  if (bse.length) grouped.BSE = bse
  return grouped
}

async function upsertSnapshots(snaps: PriceSnapshotData[]): Promise<void> {
  if (snaps.length === 0) return
  await PriceSnapshot.bulkWrite(
    snaps.map((s) => ({
      updateOne: {
        filter: { token: s.token },
        update: { $set: { ...s } },
        upsert: true,
      },
    })),
    { ordered: false },
  )
}

async function fetchEvaluatableEntries(): Promise<EvaluatableEntry[]> {
  const docs = await StrategyEntry.find({
    status: { $in: [...OPEN_ENTRY_STATUSES] },
  })
  return docs as unknown as EvaluatableEntry[]
}

async function fetchQuotesWithReauth(grouped: ExchangeTokens): Promise<PriceSnapshotData[]> {
  await getValidSession()
  try {
    return await getQuotes(grouped, 'FULL')
  } catch (err) {
    if (err instanceof AuthError) {
      await invalidateSession()
      await getValidSession()
      return await getQuotes(grouped, 'FULL')
    }
    throw err
  }
}

export type RefreshOptions = {
  // When false, portfolio holdings are NOT priced. The background cron uses this:
  // the portfolio page isn't watched while the site is closed, so there's no
  // reason to spend quote quota keeping its prices warm. Watchlist, strategy, and
  // alert tokens (including portfolio holding alerts) are always refreshed.
  // Defaults to true so the manual Refresh button and the live page pollers keep
  // the portfolio current while someone is actually using the site.
  includeHoldings?: boolean
}

export async function runRefreshCycle(
  options: RefreshOptions = {},
): Promise<RefreshResult> {
  const { includeHoldings = true } = options
  const startedAt = Date.now()
  await connectDB()
  // Drop the legacy strategy-only unique index and build the shared dedupeKey
  // index before we may write cross-source notifications this cycle. One
  // memoised syncIndexes per process; failures self-heal on the next cycle.
  await ensureNotificationIndexes()

  const [heldTokens, strategyTokens, watchlistTokens, armedHoldingAlertTokens] =
    await Promise.all([
      // Always resolved (even when holdings aren't being priced this cycle):
      // held tokens gate which holding alerts may fire, see below.
      collectOpenHoldingTokens(),
      collectStrategyTokens(),
      collectWatchlistTokens(),
      collectHoldingAlertTokens(),
    ])

  // A holding alert only makes sense while the position is actually held. Once a
  // stock is fully exited (its last transaction sold or deleted) its alert doc is
  // an orphan that would otherwise keep being priced and keep emailing. Restrict
  // alert tokens to currently-held ones; they reactivate automatically if the
  // stock is bought again.
  const holdingAlertTokens = new Set(
    [...armedHoldingAlertTokens].filter((t) => heldTokens.has(t)),
  )

  const union = new Set<string>([
    ...(includeHoldings ? heldTokens : []),
    ...strategyTokens,
    ...watchlistTokens,
    ...holdingAlertTokens,
  ])

  if (union.size === 0) {
    return {
      skipped: true,
      reason: 'no tokens',
      durationMs: Date.now() - startedAt,
    }
  }

  const grouped = await groupTokensByExchange(union)
  const totalTokens = (grouped.NSE?.length ?? 0) + (grouped.BSE?.length ?? 0)
  if (totalTokens === 0) {
    return {
      skipped: true,
      reason: 'no tokens',
      durationMs: Date.now() - startedAt,
    }
  }
  // Angel One quotes accept up to 50 tokens per request; getQuotes chunks larger
  // sets into multiple requests automatically. Log when that kicks in so the
  // extra quote calls are visible if quota ever becomes a concern.
  if (totalTokens > 50) {
    console.log(
      JSON.stringify({
        event: 'prices.refresh',
        status: 'multi-batch',
        total: totalTokens,
        batches: Math.ceil(totalTokens / 50),
      }),
    )
  }

  let snapshots: PriceSnapshotData[]
  try {
    snapshots = await fetchQuotesWithReauth(grouped)
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.log(
        JSON.stringify({ event: 'prices.refresh', status: 'rate-limited' }),
      )
      return {
        skipped: true,
        reason: 'rate_limited',
        durationMs: Date.now() - startedAt,
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    console.log(
      JSON.stringify({
        event: 'prices.refresh',
        status: 'error',
        message,
      }),
    )
    return {
      skipped: true,
      reason: 'error',
      message,
      durationMs: Date.now() - startedAt,
    }
  }

  try {
    await upsertSnapshots(snapshots)

    const entries = await fetchEvaluatableEntries()
    const outcome = await evaluateEntries(entries, snapshots)

    // Loud SL/TP alerts, but ONLY for positions actually entered into the
    // portfolio (real money the user has to go execute on). evaluateEntries has
    // already persisted the terminal status; here we create the durable
    // notification (its unique {entry,kind} index makes this fire-once, even
    // across concurrent refresh cycles) and fan out email + web push. Every side
    // effect is individually guarded so a single failure never aborts the cycle
    // — same contract as the watchlist email loop below.
    let strategyAlerts = 0
    for (const ex of outcome.exits.filter((e) => e.enteredToPortfolio)) {
      try {
        const n = await createExitNotification(ex)
        if (!n) continue // duplicate (E11000) — already delivered
        strategyAlerts += 1
        try {
          await sendStrategyExitEmail({
            instrumentSymbol: n.instrumentSymbol ?? ex.instrumentSymbol,
            instrumentToken: n.instrumentToken,
            kind: ex.kind,
            price: n.price,
            quantity: n.quantity ?? undefined,
            title: n.title,
            body: n.body,
            createdAt: ex.at,
          })
        } catch (mailErr) {
          console.log(
            JSON.stringify({
              event: 'strategy.exit.email',
              status: 'error',
              message:
                mailErr instanceof Error ? mailErr.message : String(mailErr),
            }),
          )
        }
        try {
          await sendPushToAll(
            buildExitPushPayload({
              title: n.title,
              body: n.body,
              instrumentToken: n.instrumentToken,
              strategyEntryId: String(ex.entryId),
              kind: ex.kind,
            }),
          )
        } catch (pushErr) {
          console.log(
            JSON.stringify({
              event: 'strategy.exit.push',
              status: 'error',
              message:
                pushErr instanceof Error ? pushErr.message : String(pushErr),
            }),
          )
        }
      } catch (err) {
        console.log(
          JSON.stringify({
            event: 'strategy.notify',
            status: 'error',
            entry: ex.entryId,
            message: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }

    // Watchlist price-alerts ride the same fresh snapshot batch. The alert is
    // persisted as `triggered` before its email is attempted, so at-most-once
    // holds even if the email fails. Each send is guarded so one failure
    // doesn't block the others or abort the cycle.
    const watchItems = await fetchAlertableWatchlistItems()
    // Same held-token gate as the pricing union above: never evaluate (and so
    // never email) an alert whose stock is no longer held.
    const holdingAlertDocs = (await fetchAlertableHoldingAlerts()).filter((d) =>
      heldTokens.has(d.instrumentToken),
    )

    // Indicator-derived alerts (SMA/EMA/RSI/MACD/rating/volume) need a daily
    // IndicatorSnapshot. Compute it only for tokens that actually have such an
    // armed alert, and only for tokens in this cycle's quote batch (so we have a
    // live ltp to compare against). Fresh snapshots are reused with no candle
    // call; the whole step is skipped when nobody uses Tier-B alerts.
    const indicatorAlertTokens = await collectIndicatorAlertTokens(heldTokens)
    const indicatorPairs: IndicatorPair[] = []
    for (const t of grouped.NSE ?? []) {
      if (indicatorAlertTokens.has(t)) indicatorPairs.push({ token: t, exchange: 'NSE' })
    }
    for (const t of grouped.BSE ?? []) {
      if (indicatorAlertTokens.has(t)) indicatorPairs.push({ token: t, exchange: 'BSE' })
    }
    const indicators: Map<string, IndicatorSnapshotData> =
      indicatorPairs.length > 0
        ? await refreshIndicatorSnapshots(indicatorPairs)
        : new Map()

    const triggered = [
      ...(await evaluateWatchlistAlerts(
        watchItems,
        snapshots,
        undefined,
        'watchlist',
        indicators,
      )),
      // Portfolio holding alerts ride the same snapshot batch; tagged 'portfolio'
      // so the email links back to the stock page instead of the watchlist.
      ...(await evaluateWatchlistAlerts(
        holdingAlertDocs,
        snapshots,
        undefined,
        'portfolio',
        indicators,
      )),
    ]
    // Each triggered alert now gets the same loud treatment as a strategy exit:
    // a durable Notification (→ banner + alarm) plus web-push, in addition to the
    // email. The evaluator already fired-once (armed -> triggered, persisted),
    // and createAlertNotification's dedupeKey guards against a refresh-cycle race
    // — a duplicate returns null, so we skip the email/push for it. Every side
    // effect is individually guarded so one failure never aborts the cycle.
    for (const t of triggered) {
      try {
        const n = await createAlertNotification(t)
        if (!n) continue // duplicate (E11000) — already delivered
        try {
          await sendWatchlistAlertEmail(t)
        } catch (mailErr) {
          console.log(
            JSON.stringify({
              event: 'watchlist.alert.email',
              status: 'error',
              message:
                mailErr instanceof Error ? mailErr.message : String(mailErr),
            }),
          )
        }
        try {
          await sendPushToAll(
            buildAlertPushPayload({
              title: n.title,
              body: n.body,
              instrumentToken: t.instrumentToken,
              alertId: t.alertId,
              source: t.source,
            }),
          )
        } catch (pushErr) {
          console.log(
            JSON.stringify({
              event: 'watchlist.alert.push',
              status: 'error',
              message:
                pushErr instanceof Error ? pushErr.message : String(pushErr),
            }),
          )
        }
      } catch (err) {
        console.log(
          JSON.stringify({
            event: 'watchlist.notify',
            status: 'error',
            token: t.instrumentToken,
            message: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }

    return {
      skipped: false,
      fetched: snapshots.length,
      evaluated: outcome.evaluated,
      transitioned: outcome.transitioned,
      alertsTriggered: triggered.length,
      strategyAlerts,
      durationMs: Date.now() - startedAt,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(
      JSON.stringify({
        event: 'prices.refresh',
        status: 'error',
        stage: 'persist_evaluate',
        message,
      }),
    )
    return {
      skipped: true,
      reason: 'error',
      message,
      durationMs: Date.now() - startedAt,
    }
  }
}
