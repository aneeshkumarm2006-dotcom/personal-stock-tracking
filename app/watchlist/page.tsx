import { Suspense } from 'react'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

import { connectDB } from '@/lib/db/connect'
import { WatchlistItem } from '@/lib/db/models/WatchlistItem'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { AddToWatchlistDialog } from '@/components/watchlist/AddToWatchlistDialog'
import { TriggeredAlertsFeed } from '@/components/watchlist/TriggeredAlertsFeed'
import { WatchlistView } from '@/components/watchlist/WatchlistView'

export const dynamic = 'force-dynamic'

const IST = 'Asia/Kolkata'

function istStartOfDay(): Date {
  const zoned = toZonedTime(new Date(), IST)
  const pad = (n: number) => String(n).padStart(2, '0')
  const wall = `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(
    zoned.getDate(),
  )}T00:00:00`
  return fromZonedTime(wall, IST)
}

type AlertLean = { status?: string; lastTriggeredAt?: Date | null }

export default async function WatchlistPage() {
  await connectDB()

  const items = (await WatchlistItem.find({}, { alerts: 1 }).lean()) as unknown as {
    alerts?: AlertLean[]
  }[]

  const startOfDay = istStartOfDay().getTime()
  let armed = 0
  let triggeredToday = 0
  for (const item of items) {
    for (const a of item.alerts ?? []) {
      if (a.status === 'armed') armed += 1
      if (
        a.status === 'triggered' &&
        a.lastTriggeredAt &&
        new Date(a.lastTriggeredAt).getTime() >= startOfDay
      ) {
        triggeredToday += 1
      }
    }
  }

  const summary = `${items.length} watched · ${armed} alert${
    armed === 1 ? '' : 's'
  } armed · ${triggeredToday} triggered today`

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Watchlist"
        description={summary}
        actions={<AddToWatchlistDialog />}
      />

      <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg" />}>
        <WatchlistView />
      </Suspense>

      <TriggeredAlertsFeed />
    </div>
  )
}
