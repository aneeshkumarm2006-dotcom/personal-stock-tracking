import { connectDB } from '@/lib/db/connect'
import { Instrument } from '@/lib/db/models/Instrument'
import { ResearchView } from '@/components/research/ResearchView'
import type { SelectedInstrument } from '@/components/research/types'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// `?token=…&exchange=…` makes a research view shareable and refresh-safe. We
// resolve identity from the scrip-master cache when possible, falling back to the
// URL params so a deep link still works for an instrument we haven't indexed.
export default async function ResearchPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const token = str(sp.token)

  let initial: SelectedInstrument | null = null
  if (token) {
    await connectDB()
    const inst = await Instrument.findOne({ token }).lean()
    if (inst) {
      initial = {
        token: inst.token,
        symbol: inst.symbol,
        name: inst.name ?? inst.symbol,
        exchange: inst.exchange === 'BSE' ? 'BSE' : 'NSE',
      }
    } else {
      const symbol = str(sp.symbol) ?? token
      initial = {
        token,
        symbol,
        name: str(sp.name) ?? symbol,
        exchange: str(sp.exchange) === 'BSE' ? 'BSE' : 'NSE',
      }
    }
  }

  return <ResearchView initial={initial} />
}
