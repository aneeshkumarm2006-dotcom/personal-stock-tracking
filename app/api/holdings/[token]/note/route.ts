import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { InstrumentNote } from '@/lib/db/models/InstrumentNote'
import { instrumentNoteSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { token } = await params
  await connectDB()
  const doc = await InstrumentNote.findOne({ instrumentToken: token }).lean()
  return NextResponse.json({ instrumentToken: token, note: doc?.note ?? '' })
}

// Replace the note for an instrument. Sending an empty string clears it.
export async function PUT(request: Request, { params }: Context) {
  const { token } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = instrumentNoteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const note = parsed.data.note.trim()

  await connectDB()
  const doc = await InstrumentNote.findOneAndUpdate(
    { instrumentToken: token },
    {
      $set: {
        note,
        ...(parsed.data.instrumentSymbol
          ? { instrumentSymbol: parsed.data.instrumentSymbol }
          : {}),
      },
      $setOnInsert: { instrumentToken: token },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean()

  return NextResponse.json({ instrumentToken: token, note: doc?.note ?? note })
}
