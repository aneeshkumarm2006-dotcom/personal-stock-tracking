import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { PushSubscription } from '@/lib/db/models/PushSubscription'
import { pushSubscribeSchema } from '@/lib/validation/schemas'

export const dynamic = 'force-dynamic'

// Register (or refresh) this browser's push subscription. Idempotent: upserts on
// the unique `endpoint`, so re-enabling on the same device won't duplicate.
export async function POST(request: Request) {
  await connectDB()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = pushSubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { endpoint, keys, userAgent } = parsed.data

  await PushSubscription.updateOne(
    { endpoint },
    { $set: { endpoint, keys, userAgent: userAgent ?? '', lastSeenAt: new Date() } },
    { upsert: true },
  )
  return NextResponse.json({ subscribed: true })
}
