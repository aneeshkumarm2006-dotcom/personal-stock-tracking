import { describe, it, expect } from 'vitest'
import {
  isMarketOpen,
  nextMarketOpen,
  nowIST,
} from '@/lib/time/marketHours'

// Helper: build a UTC Date from an IST wall-clock ISO string.
// 2024-01-16 is a Tuesday, 2024-01-19 a Friday,
// 2024-01-20 a Saturday, 2024-01-21 a Sunday, 2024-01-22 a Monday.
const ist = (isoNoTz: string) => new Date(`${isoNoTz}+05:30`)

describe('isMarketOpen', () => {
  it('returns true for a weekday inside the window (Tue 10:00 IST)', () => {
    expect(isMarketOpen(ist('2024-01-16T10:00:00'))).toBe(true)
  })

  it('returns false for a weekday before open (Tue 08:00 IST)', () => {
    expect(isMarketOpen(ist('2024-01-16T08:00:00'))).toBe(false)
  })

  it('returns false for a weekday after close (Tue 16:00 IST)', () => {
    expect(isMarketOpen(ist('2024-01-16T16:00:00'))).toBe(false)
  })

  it('returns false on Saturday 10:00 IST', () => {
    expect(isMarketOpen(ist('2024-01-20T10:00:00'))).toBe(false)
  })

  it('returns false on Sunday 10:00 IST', () => {
    expect(isMarketOpen(ist('2024-01-21T10:00:00'))).toBe(false)
  })

  it('returns true exactly at 09:15 IST on a weekday', () => {
    expect(isMarketOpen(ist('2024-01-16T09:15:00'))).toBe(true)
  })

  it('returns true exactly at 15:30 IST on a weekday', () => {
    expect(isMarketOpen(ist('2024-01-16T15:30:00'))).toBe(true)
  })

  it('returns false one second after close (15:30:01 IST) on a weekday', () => {
    expect(isMarketOpen(ist('2024-01-16T15:30:01'))).toBe(false)
  })

  it('returns false one second before open (09:14:59 IST) on a weekday', () => {
    expect(isMarketOpen(ist('2024-01-16T09:14:59'))).toBe(false)
  })
})

describe('nextMarketOpen', () => {
  it('returns today 09:15 IST when called before open on a weekday', () => {
    const result = nextMarketOpen(ist('2024-01-16T07:00:00'))
    expect(result.toISOString()).toBe(ist('2024-01-16T09:15:00').toISOString())
  })

  it('returns next weekday 09:15 IST when called after close mid-week', () => {
    const result = nextMarketOpen(ist('2024-01-16T16:00:00'))
    expect(result.toISOString()).toBe(ist('2024-01-17T09:15:00').toISOString())
  })

  it('skips the weekend when called Friday evening', () => {
    const result = nextMarketOpen(ist('2024-01-19T16:00:00'))
    expect(result.toISOString()).toBe(ist('2024-01-22T09:15:00').toISOString())
  })

  it('returns Monday 09:15 IST when called on Saturday', () => {
    const result = nextMarketOpen(ist('2024-01-20T10:00:00'))
    expect(result.toISOString()).toBe(ist('2024-01-22T09:15:00').toISOString())
  })

  it('returns Monday 09:15 IST when called on Sunday', () => {
    const result = nextMarketOpen(ist('2024-01-21T10:00:00'))
    expect(result.toISOString()).toBe(ist('2024-01-22T09:15:00').toISOString())
  })

  it('advances to the next day when called exactly at 09:15 IST', () => {
    const result = nextMarketOpen(ist('2024-01-16T09:15:00'))
    expect(result.toISOString()).toBe(ist('2024-01-17T09:15:00').toISOString())
  })
})

describe('nowIST', () => {
  it('returns a Date instance', () => {
    expect(nowIST()).toBeInstanceOf(Date)
  })
})
