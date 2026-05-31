import { NextResponse } from 'next/server'

import { refreshScripMaster } from '@/lib/angelone/scripMaster'
import { verifyCronRequest } from '@/lib/auth/cron'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status })
  }

  const upserted = await refreshScripMaster()
  return NextResponse.json({ status: 'ok', upserted })
}
