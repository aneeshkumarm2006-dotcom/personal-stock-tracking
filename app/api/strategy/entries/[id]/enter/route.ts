import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { Transaction } from '@/lib/db/models/Transaction'
import { strategyEnterSchema } from '@/lib/validation/schemas'
import { TERMINAL_ENTRY_STATUSES } from '@/lib/strategy/evaluate'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Turn a planned strategy entry into a REAL portfolio position:
//   1. record the actual fill as a BUY Transaction (holdings derive from these), then
//   2. update the entry to the actual levels, mark it entered/active, and link the two.
// The entry then rides the existing SL/TP evaluator, and because `enteredToPortfolio`
// is now set, an SL/TP hit fires the loud alert (see runRefreshCycle).
export async function POST(request: Request, { params }: RouteContext) {
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

  const parsed = strategyEnterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const data = parsed.data

  const entry = await StrategyEntry.findById(id)
  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  const token = (entry.instrumentToken ?? '').trim()
  if (!token) {
    return NextResponse.json(
      { error: 'Assign a stock to this entry before entering it into the portfolio' },
      { status: 400 },
    )
  }
  if (entry.enteredToPortfolio) {
    return NextResponse.json(
      { error: 'This entry is already in your portfolio' },
      { status: 409 },
    )
  }
  if ((TERMINAL_ENTRY_STATUSES as readonly string[]).includes(entry.status)) {
    return NextResponse.json(
      { error: 'This entry is closed and cannot be entered' },
      { status: 409 },
    )
  }

  // Real-money record first. Holdings are derived from transactions, so this is
  // what actually adds the position to the portfolio.
  const tx = await Transaction.create({
    instrumentToken: token,
    instrumentSymbol: entry.instrumentSymbol ?? '',
    type: 'BUY',
    quantity: data.quantity,
    price: data.entryPrice,
    date: data.date,
    charges: {
      total: data.charges,
      brokerage: 0,
      stt: 0,
      exchFees: 0,
      gst: 0,
      stampDuty: 0,
      sebiFees: 0,
    },
    notes: data.notes ?? '',
  })

  // Then update + link the entry. No multi-doc transaction is assumed (Atlas M0 /
  // standalone), so on failure we compensate by deleting the BUY we just made —
  // leaving the system all-or-nothing.
  try {
    entry.entryPrice = data.entryPrice
    entry.stopLoss = data.stopLoss
    entry.targetPrice = data.targetPrice
    if (data.target2 != null) entry.target2 = data.target2
    entry.quantity = data.quantity
    entry.enteredToPortfolio = true
    entry.portfolioTransactionId = tx._id
    entry.enteredAt = new Date()
    // A planned (pending) entry becomes a held position now — mirror the existing
    // "already entered" semantics so the evaluator tracks it for TP/SL.
    if (entry.status === 'pending') {
      entry.status = 'active'
      entry.events.push({
        type: 'entry_hit',
        price: data.entryPrice,
        timestamp: new Date(),
      })
    }
    await entry.save()
  } catch (err) {
    await tx.deleteOne().catch(() => {})
    const message = err instanceof Error ? err.message : String(err)
    console.log(
      JSON.stringify({
        event: 'strategy.enter',
        status: 'error',
        entry: id,
        message,
      }),
    )
    return NextResponse.json(
      { error: 'Failed to link the entry to the portfolio; no changes were applied' },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { entry: entry.toJSON(), transaction: tx.toJSON() },
    { status: 201 },
  )
}
