import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// The VAPID public key the browser needs to create a push subscription. Served
// at runtime (rather than baked in via NEXT_PUBLIC_*) so keys can be rotated
// through env without a rebuild. Returns { key: null } when push isn't set up.
export async function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? null })
}
