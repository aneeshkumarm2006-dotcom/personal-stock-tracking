import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { Transaction } from '@/lib/db/models/Transaction'
import {
  deleteIntroducesOversell,
  hasNegativeBalance,
  type LedgerCheckTx,
} from '@/lib/portfolio/holdings'
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

  const existing = await Transaction.findById(id).lean()
  if (!existing) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // Holdings, realized P&L and cash are all derived from the surviving
  // transactions, so deleting a BUY that backs an existing SELL would strand the
  // sell (sold qty > bought qty) and silently corrupt those figures. The create
  // and edit paths already reject that via the ledger check; the delete path
  // must too. Only block when this delete *introduces* the oversell so a
  // pre-existing inconsistency doesn't trap an unrelated transaction.
  const others = (await Transaction.find(
    { instrumentToken: existing.instrumentToken, _id: { $ne: id } },
    { type: 1, quantity: 1, date: 1 },
  ).lean()) as unknown as LedgerCheckTx[]

  const removed: LedgerCheckTx = {
    type: existing.type as 'BUY' | 'SELL',
    quantity: existing.quantity,
    date: existing.date,
  }

  if (deleteIntroducesOversell(others, removed)) {
    return NextResponse.json(
      {
        error:
          'Deleting this transaction would make sold quantity exceed bought quantity for this instrument. Delete or edit the dependent sell first.',
      },
      { status: 409 },
    )
  }

  await Transaction.findByIdAndDelete(id)

  return NextResponse.json({ deleted: true })
}
