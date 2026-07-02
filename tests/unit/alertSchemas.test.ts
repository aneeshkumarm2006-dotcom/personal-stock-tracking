import { describe, it, expect } from 'vitest'

import {
  alertCreateSchema,
  alertUpdateSchema,
} from '@/lib/validation/schemas'

describe('alertCreateSchema', () => {
  it('treats a body with no `type` as a legacy price alert (back-compat)', () => {
    const parsed = alertCreateSchema.parse({
      targetPrice: 100,
      direction: 'above',
      note: 'legacy',
    })
    expect(parsed).toMatchObject({
      type: 'price',
      targetPrice: 100,
      direction: 'above',
      note: 'legacy',
    })
  })

  it('defaults price direction to below', () => {
    const parsed = alertCreateSchema.parse({ targetPrice: 100 })
    expect(parsed).toMatchObject({ type: 'price', direction: 'below' })
  })

  it('accepts an advanced condition and its config', () => {
    const parsed = alertCreateSchema.parse({
      type: 'sma_cross',
      direction: 'below',
      config: { period: 20 },
    })
    expect(parsed).toMatchObject({
      type: 'sma_cross',
      direction: 'below',
      config: { period: 20 },
    })
  })

  it('allows omitting config for fully-defaulted types', () => {
    expect(alertCreateSchema.safeParse({ type: 'volume' }).success).toBe(true)
    expect(alertCreateSchema.safeParse({ type: 'circuit' }).success).toBe(true)
  })

  it('rejects a condition missing a required parameter', () => {
    expect(alertCreateSchema.safeParse({ type: 'sma_cross' }).success).toBe(
      false,
    )
    expect(alertCreateSchema.safeParse({ type: 'week52' }).success).toBe(false)
    expect(alertCreateSchema.safeParse({ type: 'price' }).success).toBe(false)
  })
})

describe('alertUpdateSchema', () => {
  it('accepts a status-only patch', () => {
    const parsed = alertUpdateSchema.parse({ status: 'armed' })
    expect('type' in parsed).toBe(false)
    expect(parsed).toMatchObject({ status: 'armed' })
  })

  it('accepts a note-only patch', () => {
    const parsed = alertUpdateSchema.parse({ note: 'moved' })
    expect('type' in parsed).toBe(false)
  })

  it('treats a legacy price edit (targetPrice+direction) as a full replace', () => {
    const parsed = alertUpdateSchema.parse({
      targetPrice: 105,
      direction: 'above',
      note: 'y',
    })
    expect(parsed).toMatchObject({
      type: 'price',
      targetPrice: 105,
      direction: 'above',
    })
  })

  it('accepts a full advanced-condition replace', () => {
    const parsed = alertUpdateSchema.parse({
      type: 'rsi',
      config: { rsiBand: 'oversold', threshold: 25 },
    })
    expect(parsed).toMatchObject({ type: 'rsi' })
  })

  it('rejects an empty body', () => {
    expect(alertUpdateSchema.safeParse({}).success).toBe(false)
  })
})
