import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { StrategyGroup } from '@/lib/db/models/StrategyGroup'
import { strategyGroupSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  await connectDB()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const filter: { status?: 'active' | 'closed' } = {}
  if (status === 'active' || status === 'closed') {
    filter.status = status
  }

  const groups = await StrategyGroup.find(filter).sort({ createdAt: -1 }).lean()
  return NextResponse.json(groups)
}

export async function POST(request: Request) {
  await connectDB()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = strategyGroupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const created = await StrategyGroup.create(parsed.data)
  return NextResponse.json(created.toJSON(), { status: 201 })
}
