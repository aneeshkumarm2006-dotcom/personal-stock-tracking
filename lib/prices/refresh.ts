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
import { sendWatchlistAlertEmail } from '@/lib/email/mailer'

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

export async function runRefreshCycle(): Promise<RefreshResult> {
  const startedAt = Date.now()
  await connectDB()

  const [holdingTokens, strategyTokens, watchlistTokens, holdingAlertTokens] =
    await Promise.all([
      collectOpenHoldingTokens(),
      collectStrategyTokens(),
      collectWatchlistTokens(),
      collectHoldingAlertTokens(),
    ])
  const union = new Set<string>([
    ...holdingTokens,
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

    // Watchlist price-alerts ride the same fresh snapshot batch. The alert is
    // persisted as `triggered` before its email is attempted, so at-most-once
    // holds even if the email fails. Each send is guarded so one failure
    // doesn't block the others or abort the cycle.
    const watchItems = await fetchAlertableWatchlistItems()
    const holdingAlertDocs = await fetchAlertableHoldingAlerts()
    const triggered = [
      ...(await evaluateWatchlistAlerts(watchItems, snapshots)),
      // Portfolio holding alerts ride the same snapshot batch; tagged 'portfolio'
      // so the email links back to the stock page instead of the watchlist.
      ...(await evaluateWatchlistAlerts(
        holdingAlertDocs,
        snapshots,
        undefined,
        'portfolio',
      )),
    ]
    for (const t of triggered) {
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
    }

    return {
      skipped: false,
      fetched: snapshots.length,
      evaluated: outcome.evaluated,
      transitioned: outcome.transitioned,
      alertsTriggered: triggered.length,
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
