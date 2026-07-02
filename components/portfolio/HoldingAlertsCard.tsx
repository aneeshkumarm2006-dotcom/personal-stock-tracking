'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AlertsManager } from '@/components/alerts/AlertsManager'
import { formatCurrency } from '@/lib/format'
import type { Exchange, WatchlistAlertView } from '@/lib/watchlist/types'

export type HoldingAlertsCardProps = {
  token: string
  instrumentSymbol: string
  exchange: Exchange
  ltp: number | null
}

async function fetchAlerts(token: string): Promise<WatchlistAlertView[]> {
  const res = await fetch(`/api/holdings/${encodeURIComponent(token)}/alerts`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as { alerts?: WatchlistAlertView[] }
  return data.alerts ?? []
}

// Thin Card wrapper around the shared AlertsManager. Owns its own query (the
// holding-alerts collection), and seeds symbol/exchange on the first create so
// the cron's trigger email/link stays accurate.
export function HoldingAlertsCard({
  token,
  instrumentSymbol,
  exchange,
  ltp,
}: HoldingAlertsCardProps) {
  const queryClient = useQueryClient()
  const base = `/api/holdings/${encodeURIComponent(token)}/alerts`

  const alertsQuery = useQuery({
    queryKey: ['holding-alerts', token],
    queryFn: () => fetchAlerts(token),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts</CardTitle>
        <CardDescription>
          Alert me on a price, volume, or indicator condition. Current LTP:{' '}
          {formatCurrency(ltp)}. Each alert fires once, then disarms until you
          re-arm it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertsManager
          base={base}
          alerts={alertsQuery.data ?? []}
          loading={alertsQuery.isLoading}
          createExtras={{ instrumentSymbol, exchange }}
          onChanged={() =>
            queryClient.invalidateQueries({
              queryKey: ['holding-alerts', token],
            })
          }
        />
      </CardContent>
    </Card>
  )
}
