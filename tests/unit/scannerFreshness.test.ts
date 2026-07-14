import { describe, expect, it } from 'vitest'

import {
  behindLevel,
  isWeekendKey,
  istClockMinutes,
  istTodayKey,
  nextTradingDay,
  previousTradingDay,
  sessionsBehind,
} from '@/lib/scanner/freshness'

// Calendar anchors: 2026-07-10 = Friday, 07-11 Sat, 07-12 Sun, 07-13 Monday,
// 2026-07-14 = Tuesday.

describe('istTodayKey / istClockMinutes', () => {
  it('maps a UTC instant to the IST calendar day', () => {
    // 20:00 UTC = 01:30 IST the NEXT day
    expect(istTodayKey(new Date('2026-07-14T20:00:00Z'))).toBe('2026-07-15')
    expect(istTodayKey(new Date('2026-07-14T05:00:00Z'))).toBe('2026-07-14')
  })

  it('returns minutes since IST midnight', () => {
    // 03:42 UTC = 09:12 IST
    expect(istClockMinutes(new Date('2026-07-14T03:42:00Z'))).toBe(9 * 60 + 12)
    // 18:31 UTC = 00:01 IST next day
    expect(istClockMinutes(new Date('2026-07-14T18:31:00Z'))).toBe(1)
  })
})

describe('weekend / trading-day walking', () => {
  it('flags weekends', () => {
    expect(isWeekendKey('2026-07-11')).toBe(true) // Sat
    expect(isWeekendKey('2026-07-12')).toBe(true) // Sun
    expect(isWeekendKey('2026-07-14')).toBe(false) // Tue
  })

  it('previousTradingDay skips weekends', () => {
    expect(previousTradingDay('2026-07-14')).toBe('2026-07-13') // Tue → Mon
    expect(previousTradingDay('2026-07-13')).toBe('2026-07-10') // Mon → Fri
    expect(previousTradingDay('2026-07-12')).toBe('2026-07-10') // Sun → Fri
  })

  it('nextTradingDay skips weekends', () => {
    expect(nextTradingDay('2026-07-10')).toBe('2026-07-13') // Fri → Mon
    expect(nextTradingDay('2026-07-14')).toBe('2026-07-15') // Tue → Wed
  })
})

describe('sessionsBehind', () => {
  it('is 0 when caught up (or ahead)', () => {
    expect(sessionsBehind('2026-07-13', '2026-07-13')).toBe(0)
    expect(sessionsBehind('2026-07-14', '2026-07-13')).toBe(0)
  })

  it('counts only weekdays in the gap', () => {
    // Fri → expected Mon: only Monday missing
    expect(sessionsBehind('2026-07-10', '2026-07-13')).toBe(1)
    // Thu → expected Mon: Friday + Monday missing (weekend skipped)
    expect(sessionsBehind('2026-07-09', '2026-07-13')).toBe(2)
    // Mon → expected Tue
    expect(sessionsBehind('2026-07-13', '2026-07-14')).toBe(1)
  })

  it('treats missing/garbage dates as very far behind', () => {
    expect(sessionsBehind(null, '2026-07-13')).toBe(99)
    expect(sessionsBehind('', '2026-07-13')).toBe(99)
    expect(sessionsBehind('not-a-date', '2026-07-13')).toBe(99)
  })
})

describe('behindLevel', () => {
  it('maps behind-count to a status level', () => {
    expect(behindLevel(0)).toBe('ok')
    expect(behindLevel(1)).toBe('warn') // holiday-tolerant amber
    expect(behindLevel(2)).toBe('down')
    expect(behindLevel(7)).toBe('down')
  })
})
