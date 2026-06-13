import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { StrategyGroup } from '@/lib/db/models/StrategyGroup'
import { computeGroupStats, type EntryForStats } from '@/lib/strategy/group'
import { TERMINAL_ENTRY_STATUSES } from '@/lib/strategy/evaluate'
import { loadSnapshotsForTokens } from '@/lib/prices/snapshots'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const updateGroupSchema = z.union([
  z.object({ action: z.literal('close') }),
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
  const snapshots = await loadSnapshotsForTokens(tokens)
  const stats = computeGroupStats(group, entries, snapshots)

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
    const openEntries = await StrategyEntry.countDocuments({
      groupId: id,
      status: { $nin: TERMINAL_STATUSES },
    })
    if (openEntries > 0) {
      return NextResponse.json(
        { error: 'Cannot close group with open entries' },
        { status: 409 },
      )
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

  return NextResponse.json({ deleted: true })
}
