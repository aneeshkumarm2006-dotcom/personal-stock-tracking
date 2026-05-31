import { NextResponse } from 'next/server'

import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session'
import { runRefreshCycle } from '@/lib/prices/refresh'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const token = readCookie(cookieHeader, SESSION_COOKIE_NAME)
  const valid = token ? await verifySessionToken(token) : false
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runRefreshCycle()

  if (result.skipped && result.reason === 'rate_limited') {
    return NextResponse.json(result, { status: 503 })
  }

  return NextResponse.json(result)
}

function readCookie(header: string, name: string): string | null {
  if (!header) return null
  const parts = header.split(';')
  for (const part of parts) {
    const [rawKey, ...rest] = part.split('=')
    if (!rawKey) continue
    if (rawKey.trim() === name) {
      return rest.join('=').trim()
    }
  }
  return null
}
