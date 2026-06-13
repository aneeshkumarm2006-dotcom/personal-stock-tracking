import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { HoldingTags } from '@/lib/db/models/HoldingTags'
import { normalizeTags } from '@/lib/portfolio/tags'
import { holdingTagsSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { token } = await params
  await connectDB()
  const doc = await HoldingTags.findOne({ instrumentToken: token }).lean()
  return NextResponse.json({ instrumentToken: token, tags: doc?.tags ?? [] })
}

// Replace the full tag set for a holding. Sending an empty array clears tags.
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
  const doc = await HoldingTags.findOneAndUpdate(
    { instrumentToken: token },
    {
      $set: {
        tags,
        ...(parsed.data.instrumentSymbol
          ? { instrumentSymbol: parsed.data.instrumentSymbol }
          : {}),
      },
      $setOnInsert: { instrumentToken: token },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()

  return NextResponse.json({ instrumentToken: token, tags: doc?.tags ?? tags })
}
