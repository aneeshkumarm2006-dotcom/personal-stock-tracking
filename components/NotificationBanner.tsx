'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRingIcon, XIcon } from 'lucide-react'

import { useAlarm } from '@/lib/hooks/useAlarm'

type Severity = 'danger' | 'success' | 'warning' | 'info'

type NotificationRow = {
  _id: string
  kind:
    | 'sl_hit'
    | 'tp_hit'
    | 'trail_hit'
    | 'tp1_partial'
    | 'price_below'
    | 'price_above'
  severity: Severity
  source?: 'strategy' | 'watchlist' | 'portfolio'
  instrumentSymbol: string
  instrumentToken: string
  title: string
  body: string
  price: number
  quantity?: number
  createdAt: string
}

async function fetchUnread(): Promise<NotificationRow[]> {
  const res = await fetch('/api/notifications?status=unread', {
    credentials: 'include',
  })
  // 401 = logged out / on /login. The banner is mounted globally, so treat that
  // as "nothing to show" rather than an error.
  if (res.status === 401) return []
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  return (await res.json()) as NotificationRow[]
}

// Rank so the whole bar takes the colour of its most urgent hit.
const RANK: Record<Severity, number> = {
  danger: 4,
  warning: 3,
  success: 2,
  info: 1,
}

const BAR_CLASS: Record<Severity, string> = {
  danger: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-black',
  success: 'bg-emerald-600 text-white',
  info: 'bg-blue-600 text-white',
}

export function NotificationBanner() {
  const queryClient = useQueryClient()
  const playAlarm = useAlarm()
  // Ids we've already sounded the alarm / shown a browser notification for, so a
  // 15s poll that still returns the same unread hit doesn't re-blare.
  const seen = useRef<Set<string>>(new Set())
  const originalTitle = useRef<string | null>(null)

  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: fetchUnread,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const unread = useMemo(() => data ?? [], [data])

  // Alarm + foreground browser notification, but only for NEWLY-arrived hits.
  useEffect(() => {
    const fresh = unread.filter((n) => !seen.current.has(n._id))
    if (fresh.length === 0) return
    fresh.forEach((n) => seen.current.add(n._id))
    playAlarm()
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      for (const n of fresh) {
        try {
          new Notification(n.title, {
            body: n.body,
            tag: n._id,
            requireInteraction: true,
          })
        } catch {
          // some browsers throw if invoked without an active SW — ignore
        }
      }
    }
  }, [unread, playAlarm])

  // Flash the tab title while any hit is unread, so a backgrounded tab still
  // grabs attention.
  useEffect(() => {
    if (unread.length === 0) {
      if (originalTitle.current !== null) {
        document.title = originalTitle.current
        originalTitle.current = null
      }
      return
    }
    if (originalTitle.current === null) originalTitle.current = document.title
    const base = originalTitle.current
    let on = false
    const id = window.setInterval(() => {
      on = !on
      document.title = on
        ? `🔴 (${unread.length}) ${unread.length === 1 ? 'ALERT' : 'ALERTS'}`
        : base
    }, 1000)
    return () => {
      window.clearInterval(id)
      document.title = base
    }
  }, [unread.length])

  const ackOne = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/ack`, {
        method: 'POST',
        credentials: 'include',
      })
      await queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    } catch {
      /* keep showing it; the next poll will reconcile */
    }
  }

  const ackAll = async () => {
    try {
      await fetch('/api/notifications/ack-all', {
        method: 'POST',
        credentials: 'include',
      })
      await queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    } catch {
      /* no-op */
    }
  }

  if (unread.length === 0) return null

  const topSeverity = unread.reduce<Severity>(
    (acc, n) => (RANK[n.severity] > RANK[acc] ? n.severity : acc),
    'info',
  )

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`sticky top-0 z-50 w-full ${BAR_CLASS[topSeverity]} shadow-lg`}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
            <BellRingIcon className="size-4 animate-pulse" aria-hidden="true" />
            Action needed · {unread.length} {unread.length === 1 ? 'alert' : 'alerts'}
          </span>
          <button
            type="button"
            onClick={ackAll}
            className="rounded-sm px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline"
          >
            Acknowledge all
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {unread.map((n) => (
            <li
              key={n._id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>
                <span className="font-semibold">{n.title}</span>
                <span className="opacity-90"> — {n.body}</span>
              </span>
              <button
                type="button"
                aria-label="Acknowledge"
                title="Acknowledge"
                onClick={() => ackOne(n._id)}
                className="shrink-0 rounded-sm p-1 hover:bg-black/10"
              >
                <XIcon className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
