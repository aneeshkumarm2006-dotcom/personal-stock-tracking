import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { StrategyGroup } from '@/lib/db/models/StrategyGroup'
import { strategyEntryUpdateSchema } from '@/lib/validation/schemas'
import {
  entryTriggered,
  resolveTriggerType,
  type RequestedTriggerType,
} from '@/lib/strategy/evaluate'
import { fetchReferencePrice } from '@/lib/prices/reference'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: RouteContext) {
  await connectDB()
  const { id } = await params

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = strategyEntryUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const existing = await StrategyEntry.findById(id)
  if (!existing) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }
  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: 'Only pending entries can be edited' },
      { status: 409 },
    )
  }

  const merged = {
    entryPrice: parsed.data.entryPrice ?? existing.entryPrice,
    stopLoss: parsed.data.stopLoss ?? existing.stopLoss,
    targetPrice: parsed.data.targetPrice ?? existing.targetPrice,
    target2: parsed.data.target2 ?? existing.target2 ?? null,
    quantity: parsed.data.quantity ?? existing.quantity,
  }

  if (merged.stopLoss >= merged.entryPrice) {
    return NextResponse.json(
      { error: 'stopLoss must be below entryPrice for a long entry' },
      { status: 400 },
    )
  }
  if (merged.targetPrice <= merged.entryPrice) {
    return NextResponse.json(
      { error: 'targetPrice must be above entryPrice for a long entry' },
      { status: 400 },
    )
  }
  if (merged.target2 != null && merged.target2 <= merged.targetPrice) {
    return NextResponse.json(
      { error: 'target2 must be above target1 (TP1)' },
      { status: 400 },
    )
  }

  const group = await StrategyGroup.findById(existing.groupId).lean()
  if (group) {
    const otherOpenEntries = await StrategyEntry.find({
      groupId: existing.groupId,
      status: { $in: ['pending', 'active'] },
      _id: { $ne: existing._id },
    }).lean()

    let capitalDeployed = 0
    for (const e of otherOpenEntries) {
      capitalDeployed += (e.entryPrice ?? 0) * (e.quantity ?? 0)
    }
    const capitalUsed = merged.entryPrice * merged.quantity
    const capitalFree = group.allocatedCapital - capitalDeployed

    if (capitalUsed > capitalFree) {
      return NextResponse.json(
        { error: 'Insufficient capital', capitalUsed, capitalFree },
        { status: 409 },
      )
    }
  }

  // Re-resolve the fill trigger when the entry price or the requested trigger
  // type changes — a moved entry can flip between a dip buy and a breakout, and
  // a re-resolved trigger must not fill the instant the edit is saved.
  const entryPriceChanged =
    parsed.data.entryPrice != null && parsed.data.entryPrice !== existing.entryPrice
  const triggerRequested = parsed.data.triggerType
  // triggerType is resolved separately below; never assign the raw 'auto'.
  const assignable = { ...parsed.data }
  delete assignable.triggerType
  Object.assign(existing, assignable)

  if (entryPriceChanged || triggerRequested !== undefined) {
    const referencePrice = await fetchReferencePrice(existing.instrumentToken)
    const triggerType = resolveTriggerType(
      (triggerRequested ?? existing.triggerType ?? 'auto') as RequestedTriggerType,
      merged.entryPrice,
      referencePrice,
    )

    if (
      referencePrice !== null &&
      entryTriggered(triggerType, merged.entryPrice, referencePrice)
    ) {
      return NextResponse.json(
        {
          error:
            triggerType === 'stop'
              ? 'Entry would trigger immediately: the price is already at or above the entry. Lower the entry, or use a limit (dip) buy.'
              : 'Entry would trigger immediately: the price is already at or below the entry. Raise the entry, or use a stop (breakout) buy.',
          triggerType,
          referencePrice,
        },
        { status: 409 },
      )
    }

    existing.triggerType = triggerType
    if (referencePrice !== null) existing.referencePrice = referencePrice
  }

  await existing.save()

  return NextResponse.json(existing.toJSON())
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  await connectDB()
  const { id } = await params

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  }

  const existing = await StrategyEntry.findById(id)
  if (!existing) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }
  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: 'Only pending entries can be deleted' },
      { status: 409 },
    )
  }

  await existing.deleteOne()
  return NextResponse.json({ deleted: true })
}
