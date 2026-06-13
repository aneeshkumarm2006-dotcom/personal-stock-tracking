import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { Transaction } from '@/lib/db/models/Transaction'
import { hasNegativeBalance, type LedgerCheckTx } from '@/lib/portfolio/holdings'
import { transactionSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type Filter = {
  instrumentToken?: string
  date?: { $gte?: Date; $lte?: Date }
}

export async function GET(request: Request) {
  await connectDB()

  const { searchParams } = new URL(request.url)
  const instrumentToken = searchParams.get('instrumentToken')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const filter: Filter = {}
  if (instrumentToken) filter.instrumentToken = instrumentToken

  if (from || to) {
    filter.date = {}
    if (from) {
      const d = new Date(from)
      if (!Number.isNaN(d.getTime())) filter.date.$gte = d
    }
    if (to) {
      const d = new Date(to)
      if (!Number.isNaN(d.getTime())) filter.date.$lte = d
    }
  }

  const transactions = await Transaction.find(filter).sort({ date: -1 }).lean()
  return NextResponse.json(transactions)
}

export async function POST(request: Request) {
  await connectDB()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = transactionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const existing = (await Transaction.find(
    { instrumentToken: parsed.data.instrumentToken },
    { type: 1, quantity: 1, date: 1 },
  ).lean()) as unknown as LedgerCheckTx[]

  const candidate: LedgerCheckTx = {
    type: parsed.data.type,
    quantity: parsed.data.quantity,
    date: parsed.data.date,
  }

  // Only reject when this transaction introduces the oversell; pre-existing
  // inconsistent data should not block unrelated new entries.
  if (
    !hasNegativeBalance(existing) &&
    hasNegativeBalance([...existing, candidate])
  ) {
    return NextResponse.json(
      {
        error:
          'SELL quantity exceeds the quantity held on that date for this instrument',
      },
      { status: 409 },
    )
  }

  const created = await Transaction.create(parsed.data)
  return NextResponse.json(created.toJSON(), { status: 201 })
}
