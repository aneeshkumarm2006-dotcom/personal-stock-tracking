'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { WatchlistAlertView } from '@/lib/watchlist/types'
import { useAlertsApi } from './useAlertsApi'
import { AlertRow } from './AlertRow'
import { ConditionForm } from './ConditionForm'

export type AlertsManagerProps = {
  // The alerts collection URL: /api/{watchlist|holdings}/[token]/alerts
  base: string
  alerts: WatchlistAlertView[]
  loading?: boolean
  // Extra fields merged into the create body (holdings seeds symbol/exchange).
  createExtras?: Record<string, unknown>
  onChanged: () => void | Promise<unknown>
}

// The shared alerts list + add form. Rendered inside the watchlist dialog and the
// portfolio card, which own the data fetch and pass alerts + onChanged in.
export function AlertsManager({
  base,
  alerts,
  loading,
  createExtras,
  onChanged,
}: AlertsManagerProps) {
  const { busy, addAlert, updateAlert, deleteAlert } = useAlertsApi(
    base,
    onChanged,
    createExtras,
  )

  return (
    <div className="space-y-3">
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : alerts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No alerts yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {alerts.map((alert) => (
            <AlertRow
              key={alert._id}
              alert={alert}
              busy={busy}
              onReplace={(body) => updateAlert(alert._id, body)}
              onStatus={(status) => updateAlert(alert._id, { status })}
              onDelete={() => deleteAlert(alert._id)}
            />
          ))}
        </ul>
      )}

      <div className="bg-muted/40 space-y-3 rounded-lg border p-3">
        <p className="text-sm font-medium">Add an alert</p>
        <ConditionForm
          submitLabel="Add alert"
          busy={busy}
          onSubmit={addAlert}
        />
      </div>
    </div>
  )
}
