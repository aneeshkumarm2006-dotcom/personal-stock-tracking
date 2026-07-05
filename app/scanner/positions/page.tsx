import { PageHeader, SectionHeader } from '@/components/PageHeader'
import { PositionsTable } from '@/components/scanner/PositionsTable'
import { listPositions } from '@/lib/scanner/queries'

export const dynamic = 'force-dynamic'

export default async function ScannerPositionsPage() {
  const positions = await listPositions({})

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Positions"
        description="Every position the forward test has tracked — open, pending, and closed — with entry, exit and P&L outcomes."
      />

      <section className="space-y-3">
        <SectionHeader
          title="All positions"
          hint={`${positions.length} tracked`}
        />
        <PositionsTable positions={positions} />
      </section>
    </div>
  )
}
