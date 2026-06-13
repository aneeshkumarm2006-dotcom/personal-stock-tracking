import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { CashAccount } from '@/lib/db/models/CashAccount'
import { Transaction } from '@/lib/db/models/Transaction'
import { computeCash, computeNetInvested, type CashFlowTx } from '@/lib/portfolio/cash'
import { cashAccountSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

type CashAccountRow = { fundsAdded?: number; updatedAt?: Date } | null

async function loadCash() {
  const [account, txDocs] = await Promise.all([
    CashAccount.findOne({ key: 'default' }).lean() as Promise<CashAccountRow>,
    Transaction.find({}, { type: 1, quantity: 1, price: 1, charges: 1 }).lean(),
  ])

  const transactions = txDocs as unknown as CashFlowTx[]
  const fundsAdded = account?.fundsAdded ?? 0
  const netInvested = computeNetInvested(transactions)

  return {
    ...computeCash(fundsAdded, netInvested),
    updatedAt: account?.updatedAt ?? null,
  }
}

export async function GET() {
  await connectDB()
  const cash = await loadCash()
  return NextResponse.json(cash)
}

export async function PUT(request: Request) {
  await connectDB()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = cashAccountSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  await CashAccount.findOneAndUpdate(
    { key: 'default' },
    { $set: { fundsAdded: parsed.data.fundsAdded } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  const cash = await loadCash()
  return NextResponse.json(cash)
}
