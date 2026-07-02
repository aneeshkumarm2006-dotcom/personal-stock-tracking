import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { PushSubscription } from '@/lib/db/models/PushSubscription'

export const dynamic = 'force-dynamic'

// Remove this browser's push subscription (the "Disable alerts" action).
export async function POST(request: Request) {
  await connectDB()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const endpoint = (body as { endpoint?: unknown })?.endpoint
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })
  }

  await PushSubscription.deleteOne({ endpoint })
  return NextResponse.json({ unsubscribed: true })
}
