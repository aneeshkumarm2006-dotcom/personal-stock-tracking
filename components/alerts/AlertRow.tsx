'use client'

import { useState } from 'react'
import { PencilIcon, Trash2Icon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatIstTime } from '@/lib/format'
import { describeCondition } from '@/lib/alerts/describe'
import type { AlertStatus, WatchlistAlertView } from '@/lib/watchlist/types'
import type { AlertRequestBody } from '@/lib/alerts/conditionMeta'
import { ConditionForm } from './ConditionForm'

const STATUS_VARIANT: Record<
  AlertStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  armed: 'default',
  triggered: 'secondary',
  snoozed: 'outline',
  disabled: 'destructive',
}

export type AlertRowProps = {
  alert: WatchlistAlertView
  busy: boolean
  onReplace: (body: AlertRequestBody) => Promise<boolean | void>
  onStatus: (status: AlertStatus) => void
  onDelete: () => void
}

export function AlertRow({
  alert,
  busy,
  onReplace,
  onStatus,
  onDelete,
}: AlertRowProps) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li className="p-3">
        <ConditionForm
          initial={alert}
          submitLabel="Save"
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            const ok = await onReplace(body)
            if (ok !== false) setEditing(false)
            return ok
          }}
        />
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={STATUS_VARIANT[alert.status]}>{alert.status}</Badge>
          <span>{describeCondition(alert)}</span>
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
          onClick={() => setEditing(true)}
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
