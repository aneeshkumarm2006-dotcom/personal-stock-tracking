import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { normalizeTags } from '@/lib/portfolio/tags'
import { strategyEntryTagsSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Replace the full tag set on a strategy entry. Works for any status (so a
// closed trade can still be retagged, e.g. "mistake"). Sending an empty array
// clears the tags.
export async function PUT(request: Request, { params }: RouteContext) {
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

  const parsed = strategyEntryTagsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const tags = normalizeTags(parsed.data.tags)

  const updated = await StrategyEntry.findByIdAndUpdate(
    id,
    { $set: { tags } },
    { new: true },
  ).lean()

  if (!updated) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  return NextResponse.json({ id, tags: updated.tags ?? tags })
}
