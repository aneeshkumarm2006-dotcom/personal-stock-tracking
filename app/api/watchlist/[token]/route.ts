import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { WatchlistItem } from '@/lib/db/models/WatchlistItem'
import { watchlistItemUpdateSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { token } = await params
  await connectDB()
  const doc = await WatchlistItem.findOne({ instrumentToken: token }).lean()
  if (!doc) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }
  return NextResponse.json(doc)
}

// Edit an item's metadata (target / notes / conviction / name / exchange).
// targetBuyPrice: null clears the target.
export async function PUT(request: Request, { params }: Context) {
  const { token } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = watchlistItemUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const data = parsed.data
  const set: Record<string, unknown> = {}
  const unset: Record<string, ''> = {}
  if (data.instrumentSymbol !== undefined) set.instrumentSymbol = data.instrumentSymbol
  if (data.exchange !== undefined) set.exchange = data.exchange
  if (data.name !== undefined) set.name = data.name
  if (data.notes !== undefined) set.notes = data.notes
  if (data.conviction !== undefined) set.conviction = data.conviction
  if (data.targetBuyPrice !== undefined) {
    if (data.targetBuyPrice === null) unset.targetBuyPrice = ''
    else set.targetBuyPrice = data.targetBuyPrice
  }

  const update: Record<string, unknown> = {}
  if (Object.keys(set).length) update.$set = set
  if (Object.keys(unset).length) update.$unset = unset
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  await connectDB()
  const updated = await WatchlistItem.findOneAndUpdate(
    { instrumentToken: token },
    update,
    { new: true, runValidators: true },
  ).lean()

  if (!updated) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: Context) {
  const { token } = await params
  await connectDB()
  const deleted = await WatchlistItem.findOneAndDelete({
    instrumentToken: token,
  }).lean()
  if (!deleted) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }
  return NextResponse.json({ deleted: true })
}
