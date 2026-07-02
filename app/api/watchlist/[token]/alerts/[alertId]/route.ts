import { NextResponse } from 'next/server'

import { WatchlistItem } from '@/lib/db/models/WatchlistItem'
import {
  handleAlertDelete,
  handleAlertUpdate,
} from '@/lib/alerts/routeHandlers'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string; alertId: string }> }

// Edit an alert (full condition replace) or snooze / disable / re-arm it. Shared
// with the holdings [alertId] route — see lib/alerts/routeHandlers.ts.
export async function PUT(request: Request, { params }: Context) {
  const { token, alertId } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  return handleAlertUpdate(WatchlistItem, token, alertId, body)
}

export async function DELETE(_request: Request, { params }: Context) {
  const { token, alertId } = await params
  return handleAlertDelete(WatchlistItem, token, alertId)
}
