import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { StrategyGroup } from '@/lib/db/models/StrategyGroup'
import { strategyEntrySchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = [
  'pending',
  'active',
  'partial',
  'trailing',
  'tp_hit',
  'sl_hit',
  'trail_hit',
  'closed_manual',
] as const
type EntryStatus = (typeof VALID_STATUSES)[number]

function isEntryStatus(value: string): value is EntryStatus {
  return (VALID_STATUSES as readonly string[]).includes(value)
}

export async function GET(request: Request) {
  await connectDB()

  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get('groupId')
  const status = searchParams.get('status')

  const filter: { groupId?: string; status?: EntryStatus } = {}
  if (groupId) {
    if (!isValidObjectId(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 })
    }
    filter.groupId = groupId
  }
  if (status && isEntryStatus(status)) {
    filter.status = status
  }

  const entries = await StrategyEntry.find(filter).sort({ createdAt: -1 }).lean()
  return NextResponse.json(entries)
}

export async function POST(request: Request) {
  await connectDB()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = strategyEntrySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const data = parsed.data
  if (!isValidObjectId(data.groupId)) {
    return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 })
  }

  const group = await StrategyGroup.findById(data.groupId).lean()
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }
  if (group.status === 'closed') {
    return NextResponse.json(
      { error: 'Cannot add entries to a closed group' },
      { status: 409 },
    )
  }

  const openEntries = await StrategyEntry.find({
    groupId: data.groupId,
    status: { $in: ['pending', 'active'] },
  }).lean()

  const capitalUsed = data.entryPrice * data.quantity
  let capitalDeployed = 0
  for (const e of openEntries) {
    capitalDeployed += (e.entryPrice ?? 0) * (e.quantity ?? 0)
  }
  const capitalFree = group.allocatedCapital - capitalDeployed

  if (capitalUsed > capitalFree) {
    return NextResponse.json(
      {
        error: 'Insufficient capital',
        capitalUsed,
        capitalFree,
      },
      { status: 409 },
    )
  }

  const created = await StrategyEntry.create(data)
  return NextResponse.json(created.toJSON(), { status: 201 })
}
