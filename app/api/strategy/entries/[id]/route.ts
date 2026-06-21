import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { StrategyGroup } from '@/lib/db/models/StrategyGroup'
import { strategyEntryUpdateSchema } from '@/lib/validation/schemas'
import {
  entryTriggered,
  resolveTriggerType,
  TERMINAL_ENTRY_STATUSES,
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

  // A pending entry may have been saved with no stock yet; an edit is how the
  // stock gets assigned later. Capture the token before applying the edit so we
  // can tell when it changes.
  const previousToken = existing.instrumentToken ?? ''

  // Re-resolve the fill trigger when the entry price, the requested trigger
  // type, or the assigned stock changes — any of those can flip a dip buy into a
  // breakout, and a re-resolved trigger must not fill the instant the edit is
  // saved.
  const entryPriceChanged =
    parsed.data.entryPrice != null && parsed.data.entryPrice !== existing.entryPrice
  const triggerRequested = parsed.data.triggerType
  // triggerType is resolved separately below; never assign the raw 'auto'.
  // Instrument fields are normalised and assigned explicitly just after.
  const assignable = { ...parsed.data }
  delete assignable.triggerType
  delete assignable.instrumentToken
  delete assignable.instrumentSymbol
  Object.assign(existing, assignable)

  if (parsed.data.instrumentToken !== undefined) {
    existing.instrumentToken = parsed.data.instrumentToken.trim()
  }
  if (parsed.data.instrumentSymbol !== undefined) {
    existing.instrumentSymbol = parsed.data.instrumentSymbol.trim()
  }

  const newToken = existing.instrumentToken ?? ''
  const tokenChanged = newToken !== previousToken
  const hasToken = newToken.length > 0

  // No stock means no price to resolve against — leave the trigger as-is until a
  // stock is assigned.
  if (hasToken && (entryPriceChanged || triggerRequested !== undefined || tokenChanged)) {
    const referencePrice = await fetchReferencePrice(newToken)
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
  // Only open entries (pending/active/partial/trailing) can be deleted. Settled
  // entries are kept so their realized P&L stays in the group's history.
  if ((TERMINAL_ENTRY_STATUSES as readonly string[]).includes(existing.status)) {
    return NextResponse.json(
      { error: 'Closed entries cannot be deleted' },
      { status: 409 },
    )
  }

  await existing.deleteOne()
  return NextResponse.json({ deleted: true })
}
