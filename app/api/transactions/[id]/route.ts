import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { Transaction } from '@/lib/db/models/Transaction'
import { hasNegativeBalance, type LedgerCheckTx } from '@/lib/portfolio/holdings'
import { transactionSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: RouteContext) {
  await connectDB()
  const { id } = await params

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid transaction id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = transactionSchema.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const existing = await Transaction.findById(id).lean()
  if (!existing) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  const merged = {
    instrumentToken: parsed.data.instrumentToken ?? existing.instrumentToken,
    type: parsed.data.type ?? existing.type,
    quantity: parsed.data.quantity ?? existing.quantity,
    date: parsed.data.date ?? existing.date,
  }

  const others = (await Transaction.find(
    { instrumentToken: merged.instrumentToken, _id: { $ne: id } },
    { type: 1, quantity: 1, date: 1 },
  ).lean()) as unknown as LedgerCheckTx[]

  const candidate: LedgerCheckTx = {
    type: merged.type as 'BUY' | 'SELL',
    quantity: merged.quantity,
    date: merged.date,
  }

  // Only reject when this edit introduces the oversell; pre-existing
  // inconsistent data should not block unrelated edits.
  if (!hasNegativeBalance(others) && hasNegativeBalance([...others, candidate])) {
    return NextResponse.json(
      {
        error:
          'This change would make sold quantity exceed bought quantity for this instrument',
      },
      { status: 409 },
    )
  }

  const updated = await Transaction.findByIdAndUpdate(id, parsed.data, {
    new: true,
    runValidators: true,
  }).lean()

  if (!updated) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  await connectDB()
  const { id } = await params

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid transaction id' }, { status: 400 })
  }

  const deleted = await Transaction.findByIdAndDelete(id).lean()
  if (!deleted) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  return NextResponse.json({ deleted: true })
}
