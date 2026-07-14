// Pure, client-safe trading-calendar helpers for the scanner status strips.
// "Trading day" here means Mon–Fri in IST; NSE holidays are indistinguishable
// from a missed run, so ONE missing session is always worded as "holiday, or the
// run hasn't happened yet" (amber) and only 2+ missing sessions escalate to red.
// No server imports — both server components and 'use client' children use this.

export type StatusLevel = 'ok' | 'warn' | 'down' | 'muted'

const istDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
})

// Today's IST calendar day as a sortable YYYY-MM-DD key.
export function istTodayKey(now: Date = new Date()): string {
  return istDayFormatter.format(now)
}

// Minutes since midnight IST — for "has the 09:12 runner started yet" branches.
export function istClockMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return h * 60 + m
}

// YYYY-MM-DD keys are compared/advanced in UTC space — the key IS the calendar
// day, so the zone used for the arithmetic is irrelevant as long as it's fixed.
function toUtc(key: string): Date {
  return new Date(`${key}T00:00:00Z`)
}

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isWeekendUtc(d: Date): boolean {
  const w = d.getUTCDay()
  return w === 0 || w === 6
}

export function isWeekendKey(key: string): boolean {
  const d = toUtc(key)
  return Number.isNaN(d.getTime()) ? false : isWeekendUtc(d)
}

// Most recent Mon–Fri strictly BEFORE the given day. The engines publish for the
// last COMPLETED session (the 4 AM run replays yesterday), so "caught up" means
// having data through this day, not through today.
export function previousTradingDay(key: string): string {
  const d = toUtc(key)
  if (Number.isNaN(d.getTime())) return key
  do {
    d.setUTCDate(d.getUTCDate() - 1)
  } while (isWeekendUtc(d))
  return toKey(d)
}

// Next Mon–Fri strictly AFTER the given day — for "next session …" copy.
export function nextTradingDay(key: string): string {
  const d = toUtc(key)
  if (Number.isNaN(d.getTime())) return key
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (isWeekendUtc(d))
  return toKey(d)
}

// How many Mon–Fri sessions sit in (lastKey, expectedKey]. 0 = fully caught up.
// Unknown/absent lastKey counts as very far behind.
export function sessionsBehind(
  lastKey: string | null | undefined,
  expectedKey: string,
): number {
  if (!lastKey) return 99
  const d = toUtc(lastKey)
  // Validate BEFORE the string comparison — garbage that happens to sort above
  // the expected key must read as broken, not as caught-up.
  if (Number.isNaN(d.getTime())) return 99
  if (lastKey >= expectedKey) return 0
  let behind = 0
  for (let i = 0; i < 90; i++) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (toKey(d) > expectedKey) break
    if (!isWeekendUtc(d)) behind++
  }
  return behind
}

export function behindLevel(behind: number): StatusLevel {
  if (behind <= 0) return 'ok'
  if (behind === 1) return 'warn'
  return 'down'
}
