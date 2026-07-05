import { NextResponse } from 'next/server'

import { getSettings, updateSettings } from '@/lib/scanner/queries'
import { scannerSettingsUpdateSchema } from '@/lib/scanner/schemas'

export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = await getSettings()
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = scannerSettingsUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const updated = await updateSettings(parsed.data)
  return NextResponse.json(updated)
}
