'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

// Shared id so the three live-price pollers (portfolio, watchlist, strategy)
// raise a single rate-limit toast rather than stacking one per page or per tick.
const RATE_LIMIT_TOAST_ID = 'angel-rate-limit'

// Surface Angel One's live-quote throttling as a bottom-right toast. The pollers
// already fold a 503 ("rate_limited") response into `rateLimited`; this promotes
// that from the subtle inline status label to a toast the moment throttling
// starts, then clears it once a later tick succeeds.
//
// Edge-triggered on purpose: the toast is shown once when throttling begins (the
// pollers keep reporting `rateLimited` every 15s tick while it persists) and
// dismissed on recovery — so a persisting throttle never re-nags, and a toast the
// user manually closed stays closed.
export function useRateLimitToast(rateLimited: boolean): void {
  const wasLimited = useRef(false)

  useEffect(() => {
    if (rateLimited && !wasLimited.current) {
      toast.warning('Live prices are rate-limited', {
        id: RATE_LIMIT_TOAST_ID,
        description:
          'Angel One is throttling requests. Showing the last known prices — retrying automatically.',
        duration: Infinity,
      })
    } else if (!rateLimited && wasLimited.current) {
      toast.dismiss(RATE_LIMIT_TOAST_ID)
    }
    wasLimited.current = rateLimited
  }, [rateLimited])
}
