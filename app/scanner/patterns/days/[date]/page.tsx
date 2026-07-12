import Link from 'next/link'

import { getPatternDay } from '@/lib/scanner/queries'
import { PageHeader, SectionHeader } from '@/components/PageHeader'
import { PatternDetectionsTable } from '@/components/scanner/PatternDetectionsTable'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatInt, formatIstDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ date: string }> }

export default async function PatternDayPage({ params }: RouteContext) {
  const { date } = await params
  const day = await getPatternDay(date)

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title={formatIstDate(date)}
        description={
          day.total > 0
            ? `${formatInt(day.total)} chart-pattern detections · ${formatInt(day.tradable)} tradable`
            : 'No chart patterns detected for this session.'
        }
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/scanner" />}
          >
            Back to scanner
          </Button>
        }
      />

      {day.total === 0 ? (
        <EmptyState
          title="No detections for this date"
          description="No chart patterns confirmed a breakout on this trading day, or the pattern run has not published for it."
        />
      ) : (
        <section className="space-y-3">
          <SectionHeader
            title="Detections"
            hint={`${formatInt(day.total)} across all buckets`}
          />
          <PatternDetectionsTable detections={day.detections} />
        </section>
      )}
    </div>
  )
}
