import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { Notification } from '@/lib/db/models/Notification'

export const dynamic = 'force-dynamic'

// Clear every unread notification at once — the banner's "Acknowledge all".
export async function POST() {
  await connectDB()
  const res = await Notification.updateMany(
    { status: 'unread' },
    { $set: { status: 'acknowledged', acknowledgedAt: new Date() } },
  )
  return NextResponse.json({ acknowledged: res.modifiedCount ?? 0 })
}
