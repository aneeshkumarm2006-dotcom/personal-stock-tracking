import { NextResponse } from 'next/server'

import { buildSessionClearCookie } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.headers.set('Set-Cookie', buildSessionClearCookie())
  return response
}
