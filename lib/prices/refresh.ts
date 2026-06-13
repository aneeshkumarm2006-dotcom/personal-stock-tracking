import { connectDB } from '@/lib/db/connect'
import { Instrument } from '@/lib/db/models/Instrument'
import { PriceSnapshot } from '@/lib/db/models/PriceSnapshot'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { Transaction } from '@/lib/db/models/Transaction'
import { getQuotes, type ExchangeTokens, type PriceSnapshotData } from '@/lib/angelone/quotes'
import { AuthError, RateLimitError } from '@/lib/angelone/errors'
import { getValidSession, invalidateSession } from '@/lib/angelone/session'
import { evaluateEntries, type EvaluatableEntry } from '@/lib/strategy/evaluate'

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
      durationMs: number
    }

async function collectOpenHoldingTokens(): Promise<Set<string>> {
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

async function collectStrategyTokens(): Promise<Set<string>> {
  const docs = await StrategyEntry.find(
    { status: { $in: ['pending', 'active'] } },
    { instrumentToken: 1, _id: 0 },
  ).lean()
  const set = new Set<string>()
  for (const d of docs) {
    if (d.instrumentToken) set.add(d.instrumentToken)
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
    status: { $in: ['pending', 'active'] },
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

  const [holdingTokens, strategyTokens] = await Promise.all([
    collectOpenHoldingTokens(),
    collectStrategyTokens(),
  ])
  const union = new Set<string>([...holdingTokens, ...strategyTokens])

  if (union.size === 0) {
    return {
      skipped: true,
      reason: 'no tokens',
      durationMs: Date.now() - startedAt,
    }
  }

  const grouped = await groupTokensByExchange(union)
  if ((grouped.NSE?.length ?? 0) + (grouped.BSE?.length ?? 0) === 0) {
    return {
      skipped: true,
      reason: 'no tokens',
      durationMs: Date.now() - startedAt,
    }
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

    return {
      skipped: false,
      fetched: snapshots.length,
      evaluated: outcome.evaluated,
      transitioned: outcome.transitioned,
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
