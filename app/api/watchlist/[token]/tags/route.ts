import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { WatchlistItem } from '@/lib/db/models/WatchlistItem'
import { normalizeTags } from '@/lib/portfolio/tags'
import { holdingTagsSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { token } = await params
  await connectDB()
  const doc = await WatchlistItem.findOne({ instrumentToken: token })
    .select({ tags: 1 })
    .lean()
  if (!doc) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }
  return NextResponse.json({ instrumentToken: token, tags: doc.tags ?? [] })
}

// Replace the full tag set for a watchlist item. Unlike the holdings tags route,
// this does NOT upsert — the item must already exist.
export async function PUT(request: Request, { params }: Context) {
  const { token } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = holdingTagsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const tags = normalizeTags(parsed.data.tags)

  await connectDB()
  const doc = await WatchlistItem.findOneAndUpdate(
    { instrumentToken: token },
    { $set: { tags } },
    { new: true },
  ).lean()

  if (!doc) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }
  return NextResponse.json({ instrumentToken: token, tags: doc.tags ?? tags })
}
