import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { StrategyGroup } from '@/lib/db/models/StrategyGroup'
import { computeGroupStats, type EntryForStats } from '@/lib/strategy/group'
import { TERMINAL_ENTRY_STATUSES } from '@/lib/strategy/evaluate'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'
import { normalizeSymbol, sectorForSymbol } from '@/lib/portfolio/sectors'
import { resolveSectorLive, sectorsForSymbols } from '@/lib/strategy/sector'

// How many not-yet-cached symbols to resolve from the rate-limited provider per
// request, and how long to wait before returning without them. Anything left
// unresolved shows 'Other' and is retried on the next 30s refetch; in-flight
// fetches keep running and populate the cache for next time (self-healing).
const SECTOR_FETCH_CAP = 5
const SECTOR_FETCH_BUDGET_MS = 3000

// Resolve sectors for entries the offline maps don't cover: read the persistent
// cache, then fetch a capped number of genuine misses within a time budget.
async function resolveSectors(
  entries: Pick<EntryForStats, 'instrumentSymbol'>[],
): Promise<Map<string, string>> {
  const unknown = [
    ...new Set(
      entries
        .map((e) => e.instrumentSymbol?.trim())
        .filter((s): s is string => !!s && sectorForSymbol(s) === 'Other'),
    ),
  ]
  const cacheMap = await sectorsForSymbols(unknown)

  const toFetch = unknown
    .filter((s) => !cacheMap.has(normalizeSymbol(s)))
    .slice(0, SECTOR_FETCH_CAP)
  if (toFetch.length === 0) return cacheMap

  const settled = await Promise.race([
    Promise.allSettled(
      toFetch.map(async (s) => ({
        key: normalizeSymbol(s),
        sector: await resolveSectorLive(s),
      })),
    ),
    new Promise<null>((res) => setTimeout(() => res(null), SECTOR_FETCH_BUDGET_MS)),
  ])
  if (settled) {
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value.sector !== 'Other') {
        cacheMap.set(r.value.key, r.value.sector)
      }
    }
  }
  return cacheMap
}

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const updateGroupSchema = z.union([
  z.object({ action: z.literal('close'), force: z.boolean().optional() }),
  z.object({
    name: z.string().min(1).optional(),
    allocatedCapital: z.number().positive().optional(),
  }),
])

const TERMINAL_STATUSES = [...TERMINAL_ENTRY_STATUSES]

export async function GET(_request: Request, { params }: RouteContext) {
  await connectDB()
  const { id } = await params

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid group id' }, { status: 400 })
  }

  const group = await StrategyGroup.findById(id).lean()
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  const entries = (await StrategyEntry.find({ groupId: id })
    .sort({ createdAt: 1 })
    .lean()) as unknown as (EntryForStats & { _id: unknown })[]

  const tokens = entries.map((e) => e.instrumentToken)
  const [snapshots, sectorBySymbol] = await Promise.all([
    loadSnapshotsForTokens(tokens),
    resolveSectors(entries),
  ])
  const stats = computeGroupStats(group, entries, snapshots, sectorBySymbol)

  return NextResponse.json({ group, entries, stats })
}

export async function PATCH(request: Request, { params }: RouteContext) {
  await connectDB()
  const { id } = await params

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid group id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = updateGroupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const update: Record<string, unknown> = {}
  if ('action' in parsed.data && parsed.data.action === 'close') {
    const openDocs = await StrategyEntry.find({
      groupId: id,
      status: { $nin: TERMINAL_STATUSES },
    })

    if (openDocs.length > 0) {
      if (!parsed.data.force) {
        return NextResponse.json(
          { error: 'Cannot close group with open entries' },
          { status: 409 },
        )
      }

      // Force close: book every still-open entry at its current market price
      // (falling back to the entry price when no live snapshot is available),
      // mirroring a manual close on each one, before the group is closed.
      const snapshots = await loadSnapshotsForTokens(
        openDocs.map((e) => e.instrumentToken),
      )
      const ltpByToken = new Map<string, number>()
      for (const s of snapshots) {
        if (typeof s.ltp === 'number' && Number.isFinite(s.ltp)) {
          ltpByToken.set(s.token, s.ltp)
        }
      }

      const now = new Date()
      for (const entry of openDocs) {
        const wasPending = entry.status === 'pending'
        const closePrice = ltpByToken.get(entry.instrumentToken) ?? entry.entryPrice
        const remaining = Math.max(0, entry.quantity - (entry.soldQuantity ?? 0))
        entry.soldQuantity = entry.quantity
        entry.status = 'closed_manual'
        entry.events.push({
          type: 'closed_manual',
          price: closePrice,
          quantity: wasPending ? undefined : remaining,
          timestamp: now,
        })
        await entry.save()
      }
    }

    update.status = 'closed'
    update.closedAt = new Date()
  } else if ('name' in parsed.data || 'allocatedCapital' in parsed.data) {
    if (parsed.data.name !== undefined) update.name = parsed.data.name
    if (parsed.data.allocatedCapital !== undefined) {
      update.allocatedCapital = parsed.data.allocatedCapital
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const updated = await StrategyGroup.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  }).lean()

  if (!updated) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  await connectDB()
  const { id } = await params

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid group id' }, { status: 400 })
  }

  const openEntries = await StrategyEntry.countDocuments({
    groupId: id,
    status: { $nin: TERMINAL_STATUSES },
  })

  if (openEntries > 0) {
    return NextResponse.json(
      { error: 'Cannot delete group with open entries' },
      { status: 409 },
    )
  }

  const deleted = await StrategyGroup.findByIdAndDelete(id).lean()
  if (!deleted) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  // Remove the group's entries too so no orphaned history data remains.
  const { deletedCount } = await StrategyEntry.deleteMany({ groupId: id })

  return NextResponse.json({ deleted: true, entriesDeleted: deletedCount ?? 0 })
}
