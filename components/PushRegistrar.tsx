'use client'

import { useEffect, useState } from 'react'
import { BellIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'

type Status = 'checking' | 'unsupported' | 'prompt' | 'enabled' | 'denied'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  // Back the array with a concrete ArrayBuffer so it satisfies BufferSource
  // (pushManager.subscribe rejects the SharedArrayBuffer-possible default).
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i)
  return arr
}

function isSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// Registers the service worker and offers a one-tap "Enable alerts" prompt.
// Browser permission needs a user gesture, so enabling is behind a button.
// Renders nothing once alerts are on (or when unsupported / dismissed).
export function PushRegistrar() {
  const [status, setStatus] = useState<Status>('checking')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!isSupported()) {
        if (!cancelled) setStatus('unsupported')
        return
      }
      try {
        await navigator.serviceWorker.register('/sw.js')
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (cancelled) return
        if (Notification.permission === 'denied') setStatus('denied')
        else if (Notification.permission === 'granted' && sub) setStatus('enabled')
        else setStatus('prompt')
      } catch {
        if (!cancelled) setStatus('unsupported')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const enable = async () => {
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'prompt')
        toast.error('Browser alerts were not allowed')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const keyRes = await fetch('/api/push/public-key', { credentials: 'include' })
      const { key } = (await keyRes.json()) as { key: string | null }
      if (!key) {
        toast.error('Push is not configured on the server yet')
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })
      const json = sub.toJSON() as {
        endpoint?: string
        keys?: { p256dh?: string; auth?: string }
      }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      })
      if (!res.ok) {
        toast.error('Could not save your subscription')
        return
      }
      setStatus('enabled')
      toast.success('Browser alerts enabled — even when this tab is closed')
    } catch {
      toast.error('Could not enable browser alerts')
    }
  }

  if (status !== 'prompt' || dismissed) return null

  return (
    <div className="border-b bg-muted/60 text-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5 text-xs">
        <span className="flex items-center gap-2">
          <BellIcon className="size-3.5" aria-hidden="true" />
          Turn on browser alerts so you&apos;re notified of SL/TP hits even when
          this tab is closed.
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={enable}
            className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium"
          >
            Enable alerts
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  )
}
