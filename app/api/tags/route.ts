import { NextResponse } from 'next/server'

import { connectDB } from '@/lib/db/connect'
import { getAllTags } from '@/lib/portfolio/tags'

export const dynamic = 'force-dynamic'

// Distinct catalog of all tags currently in use across holdings.
export async function GET() {
  await connectDB()
  const tags = await getAllTags()
  return NextResponse.json({ tags })
}
