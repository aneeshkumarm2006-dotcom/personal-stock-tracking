import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { Notification } from '@/lib/db/models/Notification'

export const dynamic = 'force-dynamic'

// List notifications, newest first. Defaults to unread (what the banner polls);
// pass ?status=acknowledged to see cleared ones. Behind the session middleware,
// so an unauthenticated request gets 401 (the banner treats that as "none").
export async function GET(request: Request) {
  await connectDB()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const filter: { status?: 'unread' | 'acknowledged' } = {
    status: status === 'acknowledged' ? 'acknowledged' : 'unread',
  }

  const rows = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
  return NextResponse.json(rows)
}
