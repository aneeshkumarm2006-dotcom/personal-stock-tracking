import { NextResponse } from 'next/server'
import { isValidObjectId } from 'mongoose'

import { connectDB } from '@/lib/db/connect'
import { Notification } from '@/lib/db/models/Notification'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Acknowledge (clear) a single notification — the banner calls this from its
// per-hit "Acknowledge" button.
export async function POST(_request: Request, { params }: RouteContext) {
  await connectDB()
  const { id } = await params

  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const doc = await Notification.findByIdAndUpdate(
    id,
    { $set: { status: 'acknowledged', acknowledgedAt: new Date() } },
    { new: true },
  )
  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ acknowledged: true })
}
