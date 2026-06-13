'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BellIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency, formatIstTime } from '@/lib/format'
import type {
  AlertDirection,
  AlertStatus,
  WatchlistAlertView,
  WatchlistItemView,
} from '@/lib/watchlist/types'

const STATUS_VARIANT: Record<
  AlertStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  armed: 'default',
  triggered: 'secondary',
  snoozed: 'outline',
  disabled: 'destructive',
}

function directionLabel(d: AlertDirection): string {
  return d === 'below' ? 'at or below' : 'at or above'
}

export type ManageAlertsDialogProps = {
  item: WatchlistItemView
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageAlertsDialog({
  item,
  open,
  onOpenChange,
}: ManageAlertsDialogProps) {
  const queryClient = useQueryClient()
  const base = `/api/watchlist/${encodeURIComponent(item.instrumentToken)}/alerts`

  const [target, setTarget] = useState('')
  const [direction, setDirection] = useState<AlertDirection>('below')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['watchlist'] })

  const addAlert = async () => {
    const price = Number(target)
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid target price')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(base, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPrice: price, direction, note }),
      })
      if (!res.ok) {
        toast.error(`Failed to add alert (${res.status})`)
        return
      }
      toast.success('Alert added')
      setTarget('')
      setNote('')
      setDirection('below')
      await invalidate()
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(false)
    }
  }

  const updateAlert = async (
    alertId: string,
    body: Partial<{
      targetPrice: number
      direction: AlertDirection
      note: string
      status: AlertStatus
    }>,
  ) => {
    setBusy(true)
    try {
      const res = await fetch(`${base}/${alertId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        toast.error(`Failed to update alert (${res.status})`)
        return
      }
      toast.success('Alert updated')
      setEditingId(null)
      await invalidate()
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(false)
    }
  }

  const deleteAlert = async (alertId: string) => {
    setBusy(true)
    try {
      const res = await fetch(`${base}/${alertId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        toast.error(`Failed to delete alert (${res.status})`)
        return
      }
      toast.success('Alert removed')
      await invalidate()
    } catch {
      toast.error('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Alerts for {item.instrumentSymbol || item.instrumentToken}
          </DialogTitle>
          <DialogDescription>
            Email me when the price crosses a level. Current LTP:{' '}
            {formatCurrency(item.ltp)}. Each alert fires once, then disarms until
            you re-arm it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {item.alerts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No alerts yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {item.alerts.map((alert) => (
                <AlertRow
                  key={alert._id}
                  alert={alert}
                  busy={busy}
                  editing={editingId === alert._id}
                  onEdit={() => setEditingId(alert._id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(body) => updateAlert(alert._id, body)}
                  onStatus={(status) => updateAlert(alert._id, { status })}
                  onDelete={() => deleteAlert(alert._id)}
                />
              ))}
            </ul>
          )}

          <div className="bg-muted/40 space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Add an alert</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="alert-direction">When price is</Label>
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as AlertDirection)}
                >
                  <SelectTrigger id="alert-direction" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="below">at or below</SelectItem>
                    <SelectItem value="above">at or above</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-target">Target price (₹)</Label>
                <Input
                  id="alert-target"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-note">Note (optional)</Label>
              <Input
                id="alert-note"
                type="text"
                placeholder='e.g. "buy zone"'
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button type="button" size="sm" onClick={addAlert} disabled={busy}>
              <BellIcon className="size-3.5" aria-hidden="true" />
              Add alert
            </Button>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Done
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type AlertRowProps = {
  alert: WatchlistAlertView
  busy: boolean
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (body: {
    targetPrice: number
    direction: AlertDirection
    note: string
  }) => void
  onStatus: (status: AlertStatus) => void
  onDelete: () => void
}

function AlertRow({
  alert,
  busy,
  editing,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onStatus,
  onDelete,
}: AlertRowProps) {
  const [target, setTarget] = useState(String(alert.targetPrice))
  const [direction, setDirection] = useState<AlertDirection>(alert.direction)
  const [note, setNote] = useState(alert.note)

  if (editing) {
    return (
      <li className="space-y-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={direction}
            onValueChange={(v) => setDirection(v as AlertDirection)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="below">at or below</SelectItem>
              <SelectItem value="above">at or above</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <Input
          type="text"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancelEdit}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => {
              const price = Number(target)
              if (!Number.isFinite(price) || price <= 0) {
                toast.error('Enter a valid target price')
                return
              }
              onSaveEdit({ targetPrice: price, direction, note })
            }}
          >
            Save
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={STATUS_VARIANT[alert.status]}>{alert.status}</Badge>
          <span>
            {directionLabel(alert.direction)} {formatCurrency(alert.targetPrice)}
          </span>
        </div>
        {alert.note ? (
          <p className="text-muted-foreground text-xs">{alert.note}</p>
        ) : null}
        {alert.status === 'triggered' && alert.lastTriggeredAt ? (
          <p className="text-muted-foreground text-xs">
            Triggered at {formatCurrency(alert.lastTriggeredPrice)} ·{' '}
            {formatIstTime(alert.lastTriggeredAt)}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {alert.status !== 'armed' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onStatus('armed')}
          >
            Re-arm
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onStatus('snoozed')}
          >
            Snooze
          </Button>
        )}
        {alert.status !== 'disabled' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onStatus('disabled')}
          >
            Disable
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Edit alert"
          disabled={busy}
          onClick={onEdit}
        >
          <PencilIcon className="size-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Delete alert"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2Icon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}
