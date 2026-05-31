import { NextResponse } from 'next/server'

import { getValidSession, loadSession } from '@/lib/angelone/session'
import { verifyCronRequest } from '@/lib/auth/cron'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status })
  }

  await getValidSession()
  const session = await loadSession()

  return NextResponse.json({
    status: 'ok',
    issuedAt: session?.issuedAt?.toISOString() ?? null,
  })
}
