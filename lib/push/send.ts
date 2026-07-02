import webpush from 'web-push'

import { PushSubscription } from '@/lib/db/models/PushSubscription'

// True only when all three VAPID envs are present. When false, sendPushToAll is a
// graceful no-op (mirrors the mailer's not_configured behaviour) so the refresh
// cycle never breaks just because push isn't set up.
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  )
}

let configured = false
function ensureConfigured(): boolean {
  if (!isPushConfigured()) return false
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    )
    configured = true
  }
  return true
}

export type ExitPushInput = {
  title: string
  body: string
  instrumentToken: string
  strategyEntryId: string
  kind: string
}

export type PushPayload = {
  title: string
  body: string
  url: string
  tag: string
}

export function buildExitPushPayload(n: ExitPushInput): PushPayload {
  return {
    title: n.title,
    body: n.body,
    url: `/portfolio/${encodeURIComponent(n.instrumentToken)}`,
    // Same tag the SW uses to collapse duplicates of the same exit.
    tag: `${n.strategyEntryId}:${n.kind}`,
  }
}

export type AlertPushInput = {
  title: string
  body: string
  instrumentToken: string
  alertId: string
  source: 'watchlist' | 'portfolio'
}

// Push payload for a user-armed price-cross alert. A watchlist alert links back
// to the watchlist tab; a portfolio holding alert deep-links to that stock's
// page. The tag matches the notification's dedupe family so repeats collapse.
export function buildAlertPushPayload(n: AlertPushInput): PushPayload {
  return {
    title: n.title,
    body: n.body,
    url:
      n.source === 'portfolio'
        ? `/portfolio/${encodeURIComponent(n.instrumentToken)}`
        : '/watchlist',
    tag: `${n.source}:${n.alertId}`,
  }
}

// Push one payload to every stored subscription. Dead endpoints (404/410 from
// the push service) are pruned so we don't keep retrying gone devices. Never
// throws for an individual send; the whole call is also guarded by its caller.
export async function sendPushToAll(
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 }

  const subs = await PushSubscription.find().lean()
  if (subs.length === 0) return { sent: 0, pruned: 0 }

  const body = JSON.stringify(payload)
  const gone: string[] = []
  let sent = 0

  await Promise.all(
    subs.map(async (s) => {
      if (!s.keys?.p256dh || !s.keys?.auth) return
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
          body,
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number } | null)?.statusCode
        if (status === 404 || status === 410) {
          gone.push(s.endpoint)
        } else {
          console.log(
            JSON.stringify({
              event: 'push.send',
              status: 'error',
              endpoint: s.endpoint,
              message: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      }
    }),
  )

  if (gone.length > 0) {
    await PushSubscription.deleteMany({ endpoint: { $in: gone } })
  }
  return { sent, pruned: gone.length }
}
