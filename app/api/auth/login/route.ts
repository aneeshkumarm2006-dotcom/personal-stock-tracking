import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  buildSessionCookie,
  constantTimeEqualsString,
  createSessionToken,
} from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const loginSchema = z.object({
  passphrase: z.string().min(1),
})

export async function POST(request: Request) {
  const expected = process.env.APP_AUTH_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'Server not configured' },
      { status: 500 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Passphrase is required' },
      { status: 400 },
    )
  }

  if (!constantTimeEqualsString(parsed.data.passphrase, expected)) {
    return NextResponse.json(
      { error: 'Invalid passphrase' },
      { status: 401 },
    )
  }

  const token = await createSessionToken()
  const response = NextResponse.json({ ok: true })
  response.headers.set('Set-Cookie', buildSessionCookie(token))
  return response
}
