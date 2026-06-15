import { fromZonedTime, toZonedTime } from 'date-fns-tz'

const IST_TIMEZONE = 'Asia/Kolkata'

const MARKET_OPEN_HOUR = 9
const MARKET_OPEN_MINUTE = 15
const MARKET_CLOSE_HOUR = 15
const MARKET_CLOSE_MINUTE = 30

const OPEN_SECONDS = MARKET_OPEN_HOUR * 3600 + MARKET_OPEN_MINUTE * 60
const CLOSE_SECONDS = MARKET_CLOSE_HOUR * 3600 + MARKET_CLOSE_MINUTE * 60

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function nowIST(): Date {
  return toZonedTime(new Date(), IST_TIMEZONE)
}

export function isMarketOpen(now?: Date): boolean {
  const zoned = toZonedTime(now ?? new Date(), IST_TIMEZONE)
  const day = zoned.getDay()
  if (day === 0 || day === 6) return false

  const totalSeconds =
    zoned.getHours() * 3600 +
    zoned.getMinutes() * 60 +
    zoned.getSeconds()

  return totalSeconds >= OPEN_SECONDS && totalSeconds <= CLOSE_SECONDS
}

// Trading days (NSE weekdays, IST) that have elapsed strictly after `start` up
// to and including `end`. Holidays are NOT excluded — the app keeps no holiday
// calendar, so this counts Mon–Fri exactly like nextMarketOpen() does. It is
// used to age out un-triggered strategy entries after ~2 calendar weeks, where
// being off by the occasional exchange holiday is immaterial.
export function tradingDaysBetween(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0

  const startIst = toZonedTime(start, IST_TIMEZONE)
  const endIst = toZonedTime(end, IST_TIMEZONE)
  const endOrdinal = Date.UTC(
    endIst.getFullYear(),
    endIst.getMonth(),
    endIst.getDate(),
  )

  let year = startIst.getFullYear()
  let month = startIst.getMonth()
  let day = startIst.getDate()
  let count = 0

  // Walk one IST calendar day at a time, from the day after `start` through the
  // day of `end`, tallying weekdays.
  for (;;) {
    const probe = new Date(Date.UTC(year, month, day + 1))
    year = probe.getUTCFullYear()
    month = probe.getUTCMonth()
    day = probe.getUTCDate()
    if (Date.UTC(year, month, day) > endOrdinal) break
    const dow = probe.getUTCDay()
    if (dow !== 0 && dow !== 6) count += 1
  }

  return count
}

export function nextMarketOpen(now?: Date): Date {
  const base = now ?? new Date()
  const zoned = toZonedTime(base, IST_TIMEZONE)

  let year = zoned.getFullYear()
  let month = zoned.getMonth()
  let day = zoned.getDate()

  for (let i = 0; i < 14; i++) {
    const probe = new Date(Date.UTC(year, month, day))
    const dow = probe.getUTCDay()

    if (dow !== 0 && dow !== 6) {
      const candidateIstWall = `${year}-${pad(month + 1)}-${pad(day)}T${pad(
        MARKET_OPEN_HOUR,
      )}:${pad(MARKET_OPEN_MINUTE)}:00`
      const candidateUtc = fromZonedTime(candidateIstWall, IST_TIMEZONE)
      if (candidateUtc.getTime() > base.getTime()) {
        return candidateUtc
      }
    }

    const next = new Date(Date.UTC(year, month, day + 1))
    year = next.getUTCFullYear()
    month = next.getUTCMonth()
    day = next.getUTCDate()
  }

  throw new Error('nextMarketOpen: failed to find a trading day within 14 days')
}
