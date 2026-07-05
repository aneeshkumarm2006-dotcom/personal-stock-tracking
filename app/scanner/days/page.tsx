import Link from 'next/link'

import { listDays } from '@/lib/scanner/queries'
import { PageHeader, SectionHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatInt, formatIstDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

// Run status → Badge. Duplicated per slice on purpose (kept local so the days
// package stays independent of the other scanner slices).
function statusBadge(status: string) {
  switch (status) {
    case 'ok':
      return (
        <Badge variant="outline" className="bg-gain/10 text-gain border-transparent">
          OK
        </Badge>
      )
    case 'no-signals':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          No signals
        </Badge>
      )
    case 'holiday':
      return <Badge variant="secondary">Holiday</Badge>
    case 'failed':
      return (
        <Badge variant="outline" className="bg-loss/10 text-loss border-transparent">
          Failed
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default async function ScannerDaysPage() {
  const days = await listDays()

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Scanner days"
        description="Every session the scanner has run, newest first. Open a day to see its ranked signals and their outcomes."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/scanner" />}
          >
            Overview
          </Button>
        }
      />

      <section className="space-y-3">
        <SectionHeader
          title="Sessions"
          hint={
            days.length > 0
              ? `${formatInt(days.length)} ${days.length === 1 ? 'day' : 'days'}`
              : undefined
          }
        />

        {days.length === 0 ? (
          <EmptyState
            title="No scans have run yet"
            description="Once the scanner publishes its first session, it will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table containerClassName="thin-scrollbar">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Signals</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Exits</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Equity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/scanner/days/${d.date}`}
                        className="text-primary hover:underline"
                      >
                        {formatIstDate(d.date)}
                      </Link>
                    </TableCell>
                    <TableCell>{statusBadge(d.status)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(d.signalCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.entriesFilled != null ? formatInt(d.entriesFilled) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.exits != null ? formatInt(d.exits) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.openPositionCount != null
                        ? formatInt(d.openPositionCount)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.equity != null ? formatCurrency(d.equity) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
