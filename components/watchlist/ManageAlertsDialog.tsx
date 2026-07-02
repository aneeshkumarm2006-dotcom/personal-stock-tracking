'use client'

import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertsManager } from '@/components/alerts/AlertsManager'
import { formatCurrency } from '@/lib/format'
import type { WatchlistItemView } from '@/lib/watchlist/types'

export type ManageAlertsDialogProps = {
  item: WatchlistItemView
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Thin Dialog wrapper around the shared AlertsManager. The alert list comes from
// the ['watchlist'] query (already hydrated on item.alerts); mutations invalidate
// it to refetch.
export function ManageAlertsDialog({
  item,
  open,
  onOpenChange,
}: ManageAlertsDialogProps) {
  const queryClient = useQueryClient()
  const base = `/api/watchlist/${encodeURIComponent(item.instrumentToken)}/alerts`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Alerts for {item.instrumentSymbol || item.instrumentToken}
          </DialogTitle>
          <DialogDescription>
            Alert me on a price, volume, or indicator condition. Current LTP:{' '}
            {formatCurrency(item.ltp)}. Each alert fires once, then disarms until
            you re-arm it.
          </DialogDescription>
        </DialogHeader>

        <AlertsManager
          base={base}
          alerts={item.alerts}
          onChanged={() =>
            queryClient.invalidateQueries({ queryKey: ['watchlist'] })
          }
        />

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Done
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
