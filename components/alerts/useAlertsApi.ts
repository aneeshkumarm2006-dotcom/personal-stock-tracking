'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import type { AlertStatus } from '@/lib/watchlist/types'
import type { AlertRequestBody } from '@/lib/alerts/conditionMeta'

// The add/update/delete fetch logic shared by the watchlist dialog and the
// portfolio card. `base` is the alerts collection URL
// (/api/{watchlist|holdings}/[token]/alerts); `onChanged` refetches the owner's
// query after a successful mutation. `createExtras` seeds symbol/exchange on the
// holdings first-POST (ignored by the watchlist route).
export function useAlertsApi(
  base: string,
  onChanged: () => void | Promise<unknown>,
  createExtras?: Record<string, unknown>,
) {
  const [busy, setBusy] = useState(false)

  async function run(
    fn: () => Promise<Response>,
    okMessage: string,
  ): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fn()
      if (!res.ok) {
        toast.error(`${okMessage} failed (${res.status})`)
        return false
      }
      await onChanged()
      return true
    } catch {
      toast.error('Network error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const addAlert = (body: AlertRequestBody) =>
    run(
      () =>
        fetch(base, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...createExtras, ...body }),
        }),
      'Add alert',
    ).then((ok) => {
      if (ok) toast.success('Alert added')
      return ok
    })

  const updateAlert = (
    alertId: string,
    body: AlertRequestBody | { status?: AlertStatus; note?: string },
  ) =>
    run(
      () =>
        fetch(`${base}/${alertId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      'Update alert',
    ).then((ok) => {
      if (ok) toast.success('Alert updated')
      return ok
    })

  const deleteAlert = (alertId: string) =>
    run(
      () =>
        fetch(`${base}/${alertId}`, {
          method: 'DELETE',
          credentials: 'include',
        }),
      'Remove alert',
    ).then((ok) => {
      if (ok) toast.success('Alert removed')
      return ok
    })

  return { busy, addAlert, updateAlert, deleteAlert }
}
