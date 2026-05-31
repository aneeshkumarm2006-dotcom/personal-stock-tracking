import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { strategyEntrySchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const editableFields = strategyEntrySchema
  .partial()
  .omit({ groupId: true, direction: true })

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

  const parsed = editableFields.safeParse(body)
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

  Object.assign(existing, parsed.data)
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
